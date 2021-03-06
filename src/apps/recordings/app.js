define(function(require) {
	var $ = require('jquery'),
		monster = require('monster'),
		Handlebars = require('handlebars');

	require([
		'datatables.net',
		'datatables.net-bs',
		'datatables.net-buttons',
		'datatables.net-buttons-html5',
		'datatables.net-buttons-bootstrap'
	]);

	var app = {
		name: 'recordings',

		subModules: [
			'storageManager'
		],

		css: [ 'app' ],

		settings: {
			debug: false,
			defaultDateRangeKey: 'all'
		},

		vars: {
			$appContainer: null,
			minDuration: 0,
			maxDuration: 0
		},

		i18n: {
			'en-US': { customCss: false },
			'fr-FR': { customCss: false }
		},

		// Defines API requests not included in the SDK
		requests: {},

		subscribe: {},

		load: function(callback) {
			var self = this;

			self.initApp(function() {
				callback && callback(self);
			});
		},

		initApp: function(callback) {
			var self = this;

			self._initHandlebarsHelpers();

			monster.pub('auth.initApp', {
				app: self,
				callback: callback
			});
		},

		render: function(container) {
			var self = this;

			monster.ui.generateAppLayout(self, {
				menus: [
					{
						tabs: [
							{
								callback: self.renderIndex
							}
						]
					}
				]
			});

			$(document.body).addClass('recordings-app'); // for styles;
		},

		log: function(msg){
			var self = this;
			if(self.settings.debug) {
				console.log(msg);
			}
		},

		renderIndex: function(pArgs) {
			var self = this,
				args = pArgs || {};
				self.vars.$appContainer = args.container || $('#recordings_app_container .app-content-wrapper');

			self.log('renderIndex');

			var template = $(monster.template(self, 'layout', {
				user: monster.apps.auth.currentUser,
				isAdmin: monster.util.isAdmin()
			}));

			self.vars.$appContainer.fadeOut(function() {
				$(this).empty()
					.append(template)
					.fadeIn();
				self._insertSettingsBtn(template);
			});

			self._renderRecordingsList();
		},

		_insertSettingsBtn: function(template) {
			var self = this;
			if(monster.util.isAdmin()) {
				self._initSettingsButtonBehavior();
			}

			template.on('click', '.js-close-settings', function(e) {
				e.preventDefault();
				$('.js-storages-settings').slideUp(400, function(){
					$(this).find('.js-settings-content').empty();
					$('.js-settings-btn').fadeIn();
				});
			});
		},

		_getRecordings: function(callback) {
			var self = this;

			self.log('Getting Recordings');

			self.getAll({
				resource: 'recordings.list',
				success: function(data) {
					self.log(data);

					if(typeof(callback) === 'function') {
						callback(data);
					}
				},
				error: function(data) {
					self.log('Error while getting recordings');
					self.log(data);
				}
			});
		},

		_getCDRs: function(callback) {
			var self = this;

			self.log('Getting CDRs');

			self.getAll({
				resource: 'cdrs.list',
				success: function(cdrs) {
					self.log(cdrs);

					if(typeof(callback) === 'function') {
						callback(cdrs);
					}
				},
				error: function(data) {
					//_callback({}, uiRestrictions);
					self.log('Error while getting cdrs');
					self.log(data);
				}
			});
		},

		_renderRecordingsList: function(stopIteration) {
			var self = this;

			self.callApi({
				resource: 'storage.get',
				data: {
					accountId: self.accountId,
					removeMetadataAPI: true,
					generateError: self.settings.debug
				},
				success: function(data, status) {
					self.log('Storage data:');
					self.log(data);

					try {
						var storageUUID = data.data.plan.modb.types.call_recording.attachments.handler;
						var storageData = data.data.attachments[storageUUID];

						self._getRecordings(function(recordings) {
							self._renderRecordingsTable(recordings);
						});
					} catch(e) {
						// Open settings to create new storage
						$('#settings-btn').click();
					}
				},
				error: function(response) {
					if(response && response.error === '404'&& !stopIteration) {
						self._doStorageInitialRequest(function() {
							self._renderRecordingsList(true);
						});
					}
				}
			});
		},

		_doStorageInitialRequest: function(callback) {
			var self = this;

			self.callApi({
				resource : 'storage.add',
				data : {
					accountId : self.accountId,
					data : {},
					removeMetadataAPI: true,
					generateError: self.settings.debug
				},
				success : function(data) {
					if(typeof(callback) === 'function') {
						callback(data);
					}
				},
				error : function(textStatus) {
					self.log('Error');
					self.log(textStatus);
					if(typeof(callback) === 'function') {
						callback(null);
					}
				}
			});
		},

		_renderRecordingsTable: function(recordings) {
			var self = this;

			self._extendRecordings(recordings, function(recordings) {
				var uniqueUsersNames = new Set(),
					uniqueDevicesNames = new Set(),
					minDuration = 0,
					maxDuration = 0,
					duration;

				for(var i=0, len=recordings.length; i<len; i++) {
					uniqueDevicesNames.add(recordings[i]['device_name']);
					uniqueUsersNames.add(recordings[i]['owner_name']);
					duration = parseInt(recordings[i].duration);

					recordings[i].timestamp = self._getTimestampFromGregorian(recordings[i].start);
					// date string format: '2017-05-25 14:26:00'
					recordings[i].datetime = new Date(recordings[i].timestamp)
						.toISOString()
						.substring(0,19)
						.replace('T', ' ');

					// format direction
					if(recordings[i]['direction'] === 'outbound') {
						recordings[i]['direction_formatted'] = 'OUT';
					} else if(recordings[i]['direction'] === 'inbound') {
						recordings[i]['direction_formatted'] = 'IN';
					} else {
						recordings[i]['direction_formatted'] = recordings[i]['direction'];
					}

					if(!maxDuration || duration > maxDuration) {
						maxDuration = duration;
					}

					if(!minDuration || duration < minDuration) {
						minDuration = duration;
					}
				}

				self.log('Unique Users Names:');
				self.log(uniqueUsersNames);

				self.log('Unique Devices Names:');
				self.log(uniqueDevicesNames);

				self.vars.minDuration = minDuration;
				self.vars.maxDuration = maxDuration;

				var minDurationHHMMSS = new Date(1000 * minDuration).toISOString().substr(11, 8);
				var maxDurationHHMMSS = new Date(1000 * maxDuration).toISOString().substr(11, 8);

				var template = $(monster.template(self, 'recordings-table', {
					'recordings': recordings,
					'usersNames': Array.from(uniqueUsersNames),
					'devicesNames': Array.from(uniqueDevicesNames),
					'duration': {
						'min': minDuration,
						'minHHMMSS': minDurationHHMMSS,
						'max': maxDuration,
						'maxHHMMSS': maxDurationHHMMSS
					}
				}));

				self.log(template);

				self.vars.$appContainer.find('#recordings-list-container').html(template);

				self._initRecordingsTableBehavior();
			});
		},

		_getTimestampFromGregorian: function(gregorianTimestamp) {
			return (gregorianTimestamp-62167219200)*1000;
		},

		_extendRecordings: function(recordings, callback) {
			var self = this;
			self.log('Extending recordings');
			self._getDevices(function(devices){
				for(var ri=0, rlen=recordings.length; ri<rlen; ri++) {
					for(var di=0, dlen=devices.length; di<dlen; di++) {
						if(recordings[ri].hasOwnProperty('custom_channel_vars')
							&& recordings[ri]['custom_channel_vars'].hasOwnProperty('Authorizing-ID')
							&& devices[di].id === recordings[ri]['custom_channel_vars']['Authorizing-ID']) {
							recordings[ri].device_name = devices[di].name;
							break;
						}
					}
				}

				self._getUsers(function(users){
					for(var rI=0, rLen=recordings.length; rI<rLen; rI++) {
						for(var ui=0, ulen=users.length; ui<ulen; ui++) {
							if(users[ui].id === recordings[rI].owner_id) {
								recordings[rI].owner_name =
									[users[ui].first_name, users[ui].last_name].join(' ');
								break;
							}
						}
					}

					if(typeof(callback) === 'function') {
						self.log(recordings);
						callback(recordings);
					}
				});
			});
		},

		_getDevices: function(callback) {
			var self = this;
			self.log('Getting Devices');


			self.getAll({
				resource: 'device.list',
				success: function(devices) {
					self.log(devices);

					if(typeof(callback) === 'function') {
						callback(devices);
					}
				},
				error: function(data) {
					self.log('Error while getting devices');
					self.log(data);
				}
			});
		},

		_getUsers: function(callback) {
			var self = this;
			self.log('Getting Users');


			self.getAll({
				resource: 'user.list',
				success: function(users) {
					self.log(users);

					if(typeof(callback) === 'function') {
						callback(users);
					}
				},
				error: function(data) {
					self.log('Error while getting users');
					self.log(data);
				}
			});
		},

		getAll: function(callApiData, startKey, continueData) {
			// Warning! Method works for listed data only!
			// -- Usage:
			// self.getAll({
			//   resource: 'user.list',
			//   success: function(resultArr){},
			//   error: function(data){},
			//   data: {
			//      someParam: someValue
			//   }
			// })

			continueData = continueData || [];

			var self = this;
			if(typeof(callApiData.resource) === 'undefined') {
				self.log('Error! Api keyword is undefined');
				return;
			}

			var requestData = $.extend({
				accountId: self.accountId,
				generateError: self.settings.debug
			}, callApiData.data || {});

			if(typeof(startKey) !== 'undefined') {
				requestData.startKey = startKey;
			}

			self.callApi({
				resource: callApiData.resource,
				data: requestData,
				success: function(response){
					var mergedData = $.merge(continueData, response.data);
					if(response.next_start_key && startKey !== response.next_start_key) {
						self.getAll(callApiData, response.next_start_key, mergedData);
						return;
					}

					if(typeof(callApiData.success) === 'function') {
						callApiData.success(mergedData);
					}
				},
				error: callApiData.error || function(){}
			});
		},

		_initSettingsButtonBehavior: function() {
			var self = this;

			$('.js-settings-btn').not('.handled').on('click', function(e) {
				e.preventDefault();

				var $settingsContainer = $('.js-storages-settings');

				if($settingsContainer.is(':hidden')) {
					monster.pub('recordings.storageManager.render', {
						callback: function(data) {
							self.log(data);
						},
						onSetDefault: function(){
							self._renderRecordingsList();
						},
						container: $settingsContainer.find('.js-settings-content')
					});
				} else {
					$settingsContainer.slideUp(400, function() {
						$(this).find('.js-settings-content').empty();
					});
				}
				$(this).fadeOut();
			}).addClass('handled');
		},

		_initDateTimePickers: function() {
			var $dateFrom = $('#date-from');
			var $dateTo = $('#date-to');

			var $timeFrom = $('#time-from');
			var $timeTo = $('#time-to');

			monster.ui.datepicker($dateFrom, {
				changeMonth: true,
				changeYear: true,
				dateFormat: 'yy-mm-dd',
				autoclose: true
			});

			monster.ui.datepicker($dateTo, {
				changeMonth: true,
				changeYear: true,
				dateFormat: 'yy-mm-dd',
				autoclose: true
			});

			monster.ui.timepicker($timeFrom, {
				showDuration: true,
				timeFormat: 'H:i'
			});

			monster.ui.timepicker($timeTo, {
				showDuration: true,
				timeFormat: 'H:i'
			});
		},

		_initDateTimeFilter: function(table) {
			var self = this;

			self._setDatetimeRangeByKey(self.settings.defaultDateRangeKey, table);

			var getDate = function(element) {
				var date;
				try {
					date = $.datepicker.parseDate('yy-mm-dd', element.value);
				} catch( error ) {
					date = null;
				}
				return date;
			};

			var $dateFrom = $('#date-from');
			var $dateTo = $('#date-to');

			$dateFrom.on('change keyup', function() {
				$dateTo.datepicker('option', 'minDate', getDate(this));
				table.draw();
			});

			$dateTo.on('change keyup', function() {
				$dateFrom.datepicker('option', 'maxDate', getDate(this));
				table.draw();
			});

			$('#time-to').on('change keyup', function() {
				table.draw();
			});

			$('#time-from').on('change keyup', function() {
				table.draw();
			});

			$('.js-set-date-range').on('click', function(e) {
				e.preventDefault();
				$('.js-set-date-range').removeClass('date-range-active');
				$(this).addClass('date-range-active');

				self._setDatetimeRangeByKey($(this).data('range'), table);
			})
		},

		_initDirectionFilter: function(table) {
			var self = this;
			$('select#direction').on('change', function() {
				table.draw();
				self.log('direction redraw');
			});
		},

		_initUserNameFilter: function(table) {
			var $select = $('#user-name-select'),
				self = this;
			$select.chosen();

			$select.on('change', function() {
				table.draw();
				self.log('User name redraw');
			});
		},

		_initDeviceNameFilter: function(table) {
			var $select = $('#device-name-select'),
				self = this;
			$select.chosen();

			$select.on('change', function() {
				table.draw();
				self.log('Device Name redraw');
			});
		},

		_initDurationFilter: function(table) {
			var self = this;
			var minDuration = self.vars.minDuration;
			var maxDuration = self.vars.maxDuration;

			$('#duration-slider').slider({
				range: true,
				min: minDuration,
				max: maxDuration,
				values: [ minDuration, maxDuration],
				slide: function( event, ui ) {
					var minTime = new Date(1000 * ui.values[0]).toISOString().substr(11, 8);
					var maxTime = new Date(1000 * ui.values[1]).toISOString().substr(11, 8);

					$('#duration-range-min')
						.text(minTime)
						.data('seconds', ui.values[0]);

					$('#duration-range-max')
						.text(maxTime)
						.data('seconds', ui.values[1]);

					table.draw();
				}
			});
		},

		_getDatetimeRangeByKey: function(key) {
			var startDate = new Date(),
				endDate = new Date();
			switch(key) {
				case 'last-year':
					startDate.setFullYear(endDate.getFullYear()-1);
					break;
				case 'last-month':
					startDate.setMonth(endDate.getMonth()-1);
					break;
				case 'last-week':
					startDate.setDate(endDate.getDate() - 7);
					break;
				case 'last-day':
					startDate.setDate(endDate.getDate() - 1);
					break;
				case 'last-hour':
					startDate.setHours(endDate.getHours() - 1);
					break;
				default: // "all"
					startDate = new Date(0);
			}

			return [startDate, endDate];
		},

		_setDatetimeRangeByKey: function(key, table) {
			var self = this;
			var dateRange = self._getDatetimeRangeByKey(key);

			$('.js-set-date-range').removeClass('date-range-active');
			$('.js-set-date-range[data-range="' + key + '"]').addClass('date-range-active');

			self._setDatetimeRange(dateRange[0], dateRange[1], table);
		},

		_setDatetimeRange: function(startDate, endDate, table) {
			$('#date-from').datepicker('setDate', startDate);
			$('#time-from').timepicker('setTime', startDate);
			$('#date-to').datepicker('setDate', endDate);
			$('#time-to').timepicker('setTime', endDate);
			table.draw();
		},

		_initRecordingsTableBehavior: function() {
			var self = this;

			self._initAudioPlayers();
			self._initDateTimePickers();
			self._initDataTablesFilters();

			var table = $('table#recordings-list').DataTable({
				'bStateSave': false,
				'lengthMenu': [[5, 25, 50, -1], [5, 25, 50, 'All']],
				'aoColumns': [
					null, null, {'sType': 'date'}, null, null, null, null, null
				],
				'initComplete': function(settings, json) {
					// move filters outside Datatables wrapper in reserved containers
					$('#recordings-list_length').appendTo('#filter-length-box');
					$('#recordings-list_filter').appendTo('#filter-search-box');
				},
				'columnDefs': [
					{
						'name': 'datetime',
						'targets': 2,
						'render': function (data, type, row) {
							return data;
						}
					},
					{
						'name': 'duration',
						'targets': 6,
						'render': function (data, type, row) {
								return new Date(1000 * data).toISOString().substr(11, 8);
						}
					},
					{
						'targets'  : 'no-sort',
						'orderable': false
					}
				],
				dom: 'lfrtipB',
				buttons: [
					'csvHtml5'
				]
			});

			self._initDateTimeFilter(table);
			self._initDirectionFilter(table);
			self._initUserNameFilter(table);
			self._initDeviceNameFilter(table);
			self._initDurationFilter(table);
			self._initResetFiltersBtn(table);

		},

		_initResetFiltersBtn: function(table) {
			var self = this;

			$('#reset-filters').on('click', function(e) {
				e.preventDefault();

				self._setDatetimeRangeByKey(self.settings.defaultDateRangeKey, table);
				$('#direction').val('all');
				$('#caller-id-name').val('').trigger('chosen:updated');
				$('#user-name-select').val('').trigger('chosen:updated');
				$('#device-name-select').val('').trigger('chosen:updated');

				var $durationSlider = $('#duration-slider');
				var min = $durationSlider.slider('option', 'min');
				var max = $durationSlider.slider('option', 'max');
				$durationSlider.slider('option', 'values', [min, max]);

				var minHHMMSS = new Date(1000 * min).toISOString().substr(11, 8);
				var maxHHMMSS = new Date(1000 * max).toISOString().substr(11, 8);

				$('#duration-range-min')
					.data('seconds', min)
					.text(minHHMMSS);
				$('#duration-range-max')
					.data('seconds', max)
					.text(maxHHMMSS);

				$('#recordings-list_filter input[type="search"]').val('');
				table.search('').draw();
			})
		},

		_initDataTablesFilters: function() {
			var self = this;
			var parseDateTimeValue = function(rawDT) {
				// rawDT example: '2017-05-25 14:26:00'
				if(typeof(rawDT) === 'string') {
					// '2017-05-25 14:26:00' to '20170525142600'
					return rawDT.replace(/[\s\:\-]/g, '');
				}
			};

			// reset filters
			window.jQuery.fn.dataTable.ext.search = [];

			// datetime filter
			window.jQuery.fn.dataTable.ext.search.push(function(settings, data, dataIndex) {
				var datetimeStart = parseDateTimeValue($('#date-from').val() + ' ' + $('#time-from').val() + ':00');
				var datetimeEnd = parseDateTimeValue($("#date-to").val() + ' ' + $('#time-to').val() + ':00');
				var evalDate= parseDateTimeValue(data[2]);
				//self.log(evalDate + ' >= ' + datetimeStart + ' && ' + evalDate + ' <= ' + datetimeEnd);
				return (evalDate >= datetimeStart && evalDate <= datetimeEnd);
			});

			// direction filter
			window.jQuery.fn.dataTable.ext.search.push(function(settings, data, dataIndex) {
				var evalDirection = data[1];
				var direction = $('select#direction option:selected').val();
				return (direction === 'all' || direction === evalDirection);
			});

			// user name filter
			window.jQuery.fn.dataTable.ext.search.push(function(settings, data, dataIndex) {
				var namesArr = $("#user-name-select").val();
				var evalName = data[3];
				if(!namesArr || typeof(namesArr) === 'undefined' || !evalName) {
					return true;
				}
				for(var n=0, len=namesArr.length; n<len; n++) {
					if(evalName === namesArr[n]) {
						return true;
					}
				}
				return false;
			});

			// device name filter
			window.jQuery.fn.dataTable.ext.search.push(function(settings, data, dataIndex) {
				var namesArr = $("#device-name-select").val();
				var evalName = data[4];
				if(!namesArr || typeof(namesArr) === 'undefined' || !evalName) {
					return true;
				}
				for(var n=0, len=namesArr.length; n<len; n++) {
					if(evalName === namesArr[n]) {
						return true;
					}
				}
				return false;
			});

			// duration filter
			window.jQuery.fn.dataTable.ext.search.push(function(settings, data, dataIndex) {
				var min = parseInt($('#duration-range-min').data('seconds'));
				var max = parseInt($('#duration-range-max').data('seconds'));
				var evalArr = data[6].split(':'); // "00:02:46" to ['00', '02', '46']
				var evalSeconds = parseInt(evalArr[2]) // seconds
					+ parseInt(evalArr[1]) * 60 // minutes
					+ parseInt(evalArr[0]*60*60); // hours

				return (evalSeconds >= min && evalSeconds <= max);
			});
		},

		_initAudioPlayers: function() {
			var self = this;

			var getAudio = function(data){
				var xhr = new XMLHttpRequest();
				xhr.onreadystatechange = function() {
					if (this.readyState == 4) {
						if (this.status == 200) {
							if(typeof(data.success) === 'function') {
								data.success(this.response);
							}
						} else {
							if (typeof(data.error) === 'function') {
								data.error();
							}
						}
					}
				};
				xhr.open('GET', self.apiUrl + 'accounts/' + self.accountId + '/recordings/' + data.recordingId + '?accept=audio/mpeg');
				xhr.setRequestHeader('X-Auth-Token', self.getAuthToken());
				xhr.responseType = 'blob';
				xhr.send();
			};

			self.vars.$appContainer.find('.js-play-recording').not('.js-handled').on('click', function(e) {
				e.preventDefault();

				var $btn = $(this);
				var $icon = $btn.find('.fa').attr('class', 'fa fa-spinner fa-pulse');

				var recordingId = $btn.data('recording-id');

				getAudio({
					recordingId: recordingId,
					success: function(blob){
						var objectUrl = window.URL.createObjectURL(blob);
						var player = document.getElementById('recording-player-' + recordingId);
						player.src = objectUrl;
						player.play();

						player.addEventListener('loadeddata', function() {
							window.URL.revokeObjectURL(objectUrl);
						}, false);
						player.style.display = 'inline-block';
						$icon.attr('class', 'fa fa-play');
					},
					error: function(){
						$icon.attr('class', 'fa fa-exclamation-triangle');
					}
				});
			}).addClass('js-handled');

			self.vars.$appContainer.find('.js-download-recording').not('.js-handled').on('click', function(e) {
				e.preventDefault();
				var $btn = $(this);
				var recordingId = $btn.data('recording-id');
				var $icon = $btn.find('.fa').attr('class', 'fa fa-spinner fa-pulse');

				var $itemParent = $btn.closest('.js-item');
				var datetime = $itemParent.find('.js-item-datetime').text()
					.replace(/:/g, '-')
					.replace(/\s/g, '__');
				var owner = $itemParent.find('.js-item-owner').text().replace(/\s/g, '_');
				var number = $itemParent.find('.js-item-number').text();

				var fileName = datetime + '__' + number + '__' + owner + '.mp3';

				getAudio({
					recordingId: recordingId,
					success: function(blob){
						var objectUrl = window.URL.createObjectURL(blob);
						var a = document.createElement("a");
						document.body.appendChild(a);
						a.style.display = 'none';
						a.href = objectUrl;
						a.download = fileName;
						a.click();
						window.URL.revokeObjectURL(objectUrl);
						$icon.attr('class', 'fa fa-download');
					},
					error: function(){
						$icon.attr('class', 'fa fa-exclamation-triangle');
					}
				});
			}).addClass('js-handled');
		},

		_initHandlebarsHelpers: function() {
			Handlebars.registerHelper('inc', function(value, options) {
				return parseInt(value) + 1;
			});
		}
	};

	return app;
});
/*global content, jQuery, MM, observable, setTimeout, clearTimeout, window, gapi, btoa, XMLHttpRequest */
MM.GoogleDriveRepository = function (clientId, apiKey, networkTimeoutMillis, contentType) {
	'use strict';
	observable(this);
	var driveLoaded,
		isAuthorised,
		dispatchEvent = this.dispatchEvent,
		saveFile = function (mapInfo) {
			var	deferred = jQuery.Deferred(),
				boundary = '-------314159265358979323846',
				delimiter = "\r\n--" + boundary + "\r\n",
				close_delim = "\r\n--" + boundary + "--",
				metadata = {
					'title': mapInfo.idea.title + ".mup",
					'mimeType': contentType
				},
				data = JSON.stringify(mapInfo.idea),
				multipartRequestBody =
					delimiter +
					'Content-Type: application/json\r\n\r\n' +
					JSON.stringify(metadata) +
					delimiter +
					'Content-Type: ' + contentType + '\r\n' +
					'\r\n' +
					data +
					close_delim,
				request = gapi.client.request({
					'path': '/upload/drive/v2/files' + (mapInfo.googleId ? "/" + mapInfo.googleId : ""),
					'method': (mapInfo.googleId ? 'PUT' : 'POST'),
					'params': {'uploadType': 'multipart'},
					'headers': {
						'Content-Type': 'multipart/mixed; boundary="' + boundary + '"'
					},
					'body': multipartRequestBody
				});
			request.execute(function (resp) {
				if (resp.error) {
					deferred.reject(resp.error);
				} else {
					if (!mapInfo.googleId) {
						mapInfo.mapId = "g1" + resp.id;
						mapInfo.googleId = resp.id;
					}
					deferred.resolve(mapInfo);
				}
			});
			return deferred.promise();
		},
		downloadFile = function (file) {
			var deferred = jQuery.Deferred(),
				xhr;
			if (file.downloadUrl) {
				xhr = new XMLHttpRequest();
				xhr.open('GET', file.downloadUrl);
				if (file.title) {
					xhr.setRequestHeader('Authorization', 'Bearer ' + gapi.auth.getToken().access_token);
				}
				xhr.onload = function () {
					deferred.resolve({
						title: file.title || 'unknown',
						body: JSON.parse(xhr.responseText)
					});
				};
				xhr.onerror = deferred.reject;
				xhr.send();
			} else {
				deferred.reject();
			}
			return deferred.promise();
		},
		loadFile = function (fileId) {
			var deferred = jQuery.Deferred(),
				request = gapi.client.drive.files.get({
					'fileId': fileId
				});
			request.execute(function (resp) {
				if (resp.error) {
					if (resp.error.code === 404) {
						deferred.reject('no-access-allowed');
					} else {
						deferred.reject(resp.error);
					}
				} else {
					downloadFile(resp).then(deferred.resolve, deferred.reject);
				}
			});
			return deferred.promise();
		},
		checkAuth = function (showDialog) {
			var deferred = jQuery.Deferred();
			gapi.auth.authorize(
				{
					'client_id': clientId,
					'scope': 'https://www.googleapis.com/auth/drive  https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.install https://www.googleapis.com/auth/userinfo.profile',
					'immediate': !showDialog
				},
				function (authResult) {
					if (authResult) {
						isAuthorised = true;
						deferred.resolve();
					} else {
						isAuthorised = false;
						deferred.reject();
					}
				}
			);
			return deferred.promise();
		},
		authenticate = function () {
			var deferred = jQuery.Deferred();
			checkAuth(false).then(deferred.resolve, function () {
				dispatchEvent('authRequired', 'This operation requires authentication through Google!', function () {
					checkAuth(true).then(deferred.resolve, deferred.reject);
				});
			});
			return deferred.promise();
		},
		loadApi = function (onComplete) {
			if (window.gapi && window.gapi.client) {
				onComplete();
			} else {
				window.googleClientLoaded = function () { onComplete(); };
				jQuery('<script src="https://apis.google.com/js/client.js?onload=googleClientLoaded"></script>').appendTo('body');
			}
		},
		makeReady = function () {
			var deferred = jQuery.Deferred();
			if (driveLoaded) {
				authenticate().then(deferred.resolve, deferred.reject);
				return;
			}
			loadApi(function () {
				gapi.client.setApiKey(apiKey);
				gapi.client.load('drive', 'v2', function () {
					driveLoaded = true;
					authenticate().then(deferred.resolve, deferred.reject);
				});
			});
			return deferred.promise();
		};
	this.ready = function () {
		var deferred = jQuery.Deferred();
		if (driveLoaded && isAuthorised) {
			deferred.resolve();
		} else {
			makeReady().then(deferred.resolve, deferred.reject);
		}
		return deferred.promise();
	};

	this.recognises = function (mapId) {
		return mapId && mapId[0] === "g";
	};

	this.retrieveAllFiles = function () {
		var deferred = jQuery.Deferred(),
			searchCriteria = "mimeType = '" + contentType + "' and not trashed",
			retrievePageOfFiles = function (request, result) {
				request.execute(function (resp) {
					result = result.concat(resp.items);
					var nextPageToken = resp.nextPageToken;
					if (nextPageToken) {
						request = gapi.client.drive.files.list({
							'pageToken': nextPageToken,
							q: searchCriteria
						});
						retrievePageOfFiles(request, result);
					} else {
						deferred.resolve();
					}
				});
			},
			initialRequest = gapi.client.drive.files.list({
				'q': searchCriteria
			});
		retrievePageOfFiles(initialRequest, []);
		return deferred.promise();
	};



	this.loadMap = function (mapId) {
		var deferred = jQuery.Deferred(),
			googleId = mapId.substr(2),
			loadSucceeded = function (result) {
				var mapInfo = {
					mapId: mapId,
					googleId: googleId,
					idea: content(result.body)
				};
				deferred.resolve(mapInfo);
			},
			readySucceeded = function () {
				loadFile(googleId).then(loadSucceeded, deferred.reject);
			};
		this.ready().then(readySucceeded, deferred.reject);
		return deferred.promise();
	};

	this.saveMap = function (mapInfo) {
		var deferred = jQuery.Deferred(),
			timeout,
			saveSucceeded = function (savedMapInfo) {
				clearTimeout(timeout);
				deferred.resolve(savedMapInfo);
			},
			readySucceeded = function () {
				timeout = setTimeout(deferred.reject, networkTimeoutMillis);
				saveFile(mapInfo).then(saveSucceeded, deferred.reject);
			};
		this.ready().then(readySucceeded, deferred.reject);
		return deferred.promise();

	};
};


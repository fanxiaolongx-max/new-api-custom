(function isolateEmbeddedConsoleAuth() {
    'use strict';

    if (window.self === window.top)
        return;

    // Guacamole revokes the previously stored token when login returns a new
    // one. Concurrent embedded windows must each see only their own token.
    angular.module('auth').config(['$provide', function ($provide) {
        $provide.decorator('localStorageService', ['$delegate', function (storage) {
            var tokenKey = 'GUAC_AUTH_TOKEN';
            var token = null;

            return {
                getItem: function (key) {
                    return key === tokenKey ? token : storage.getItem(key);
                },
                setItem: function (key, value) {
                    if (key === tokenKey)
                        token = value;
                    else
                        storage.setItem(key, value);
                },
                removeItem: function (key) {
                    if (key === tokenKey)
                        token = null;
                    else
                        storage.removeItem(key);
                }
            };
        }]);
    }]);
}());

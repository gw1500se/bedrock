/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */

window.Mozilla.FxaIframe = (function($) {
    'use strict';

    // stores user-supplied config
    let _config;

    // stores event name for GA
    let _gaEventName;

    // remembers if iframe has performed auth handshake
    let _handshake = false;

    // host domain for FxA
    let _host;

    // reference to <iframe> element containing FxA
    let _$iframe;

    // stores full URL to FxA to be used for <iframe> src attribute
    let _src;

    const _init = function(userConfig) {
        // store user supplied config
        _config = userConfig;

        _host = $('#fxa-iframe-config').data('host');
        _$iframe = $('#fxa');
        _src = _$iframe.data('src');

        // set up postMessage listener
        window.addEventListener('message', _onMessageReceived, true);

        // if specified, pre-populate email address in iframe form
        if (_config.userEmail && /(.+)@(.+)\.(.+){2,}/.test(_config.userEmail)) {
            _src = _src + '&email=' + encodeURIComponent(_config.userEmail);
        }

        // make sure _host URL doesn't have a trailing slash
        _host = (_host[_host.length - 1] === '/') ? _host.substr(0, _host.length - 1) : _host;

        // check user's Fx version to determine FxA iframe experience
        if (Mozilla.Client.FirefoxMajorVersion >= 46) {
            _src = _src.replace('context=iframe', 'context=fx_firstrun_v2');
        }

        // initialize GA event name
        _gaEventName = _config.gaEventName || 'fxa';

        // call iframe to life by setting src attribute
        _$iframe.attr('src', _src);

        // set a timeout to show FxA (error page, most likely) should the ping event fail
        setTimeout(() => {
            if (!_handshake) {
                _showIframe(400);
            }
        }, 2500);
    };

    // resize and ensure visibility of iframe
    const _showIframe = (height) => {
        _$iframe.css('height', height + 'px').addClass('loaded');
    };

    const _sendGAEvent = (type, extra) => {
        let data = {
            'event': _gaEventName, // user-configurable, defaults to 'fxa'
            'interaction': type
        };

        // merge additional properties if available
        if (extra) {
            $.extend(data, extra);
        }

        window.dataLayer.push(data);
    };

    const _userCallback = (callbackName, data) => {
        if (typeof _config[callbackName] === 'function') {
            _config[callbackName](data);
        }
    };

    // postMessage communication handlers
    const _onMessageReceived = e => {
        // make sure origin is as expected
        if (e.origin !== _host) {
            return;
        }

        const data = JSON.parse(e.data);

        switch (data.command) {
        // iframe is pinging host page
        case 'ping':
            _onPing(data);
            break;
        // iframe has loaded successfully
        case 'loaded':
            _onLoaded(data);
            break;
        // iframe has changed size due to content change
        case 'resize':
            _onResize(data);
            break;
        // user has signed up, but not yet verified email
        case 'signup_must_verify':
            _onSignupMustVerify(data);
            break;
        // user has returned to page after verifying email (may never happen)
        case 'verification_complete':
            _onVerificationComplete(data);
            break;
        // user has logged in (instead of signing up)
        case 'login':
            _onLogin();
            break;
        }
    };

    const _onPing = data => {
        // tell iframe we are expecting it
        if (_config.testing !== true) { // allow unit test to bypass auth
            var fxaFrameTarget = _$iframe[0].contentWindow;
            // data must be back in string format for postMessage
            fxaFrameTarget.postMessage(JSON.stringify(data), _host);
        }

        // remember iframe has loaded
        _handshake = true;

        _userCallback('onPing', data);
    };

    const _onLoaded = data => {
        _sendGAEvent('fxa-loaded');
        _userCallback('onLoaded', data);
    };

    const _onResize = data => {
        // update iframe to accommodate new height
        _showIframe(data.data.height);
        _userCallback('onResize', data);
    };

    const _onSignupMustVerify = data => {
        // if emailOptIn property is present, send value to GA
        if (data.data.hasOwnProperty('emailOptIn')) {
            _sendGAEvent('email opt-in', { 'label': data.data.emailOptIn });
        }

        _sendGAEvent('fxa-signup');
        _userCallback('onSignupMustVerify', data);
    };

    const _onVerificationComplete = data => {
        _sendGAEvent('fxa-verified');
        _userCallback('onVerificationComplete', data);
    };

    const _onLogin = () => {
        _sendGAEvent('fxa-signin');

        // no custom callback here, as redirect may cancel callback
        window.location.href = _host + '/settings';
    };

    // public properties/methods
    return {
        // Must be called from page specific script to initialize the iframe
        //
        // userConfig: optional object containing any of the following:
        //     gaEventName: string name of GA event (generally customized per
        //         page - defaults to 'fxa')
        //     onPing: function called after iframe 'ping' postMessage
        //     onLoaded: function called after iframe 'loaded' postMessage
        //     onResize: function called after iframe 'resize' postMessage
        //     onSignupMustVerify: function called after iframe
        //         'signup_must_verify' postMessage
        //     onVerificationComplete: function called after iframe
        //         'verification_complete' postMessage
        //     userEmail: email address to be pre-populated in iframe form
        init: function(userConfig) {
            _init(userConfig || {});
        }
    };
})(window.jQuery);
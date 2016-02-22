(function() {

    'use strict';

    var config = {
        // The $infoBar HTML element
        $infoBar: {},
        $message: {},
        $acceptButton: {},
        $cancelButton: {},
        // info bar(s) the user wish to use
        bars: [],
        // The current instance of an InfoBar
        bar: {},
        opened: false,
        json: {},
        pageLang: '',
        // list of available languags from either a list of hreflang links
        // or options from a select element. Populated by @getAvailableLangs
        availableLangs: {},
        // Array of one or more user languages as exposed by the user agent
        acceptLangs:[],
        // The language used to load the strings and data for the InfoBar
        offeredLang: ''
    };

    var InfoBar = function (id, name) {
        this.id = id;
        this.name = name;
        this.disabled = false;
        this.prefName = 'infobar.' + id + '.disabled';

        // Read the preference
        try {
            if (sessionStorage.getItem(this.prefName) === 'true') {
                this.disabled = true;
            }
        } catch (ex) {
            console.log('Error thrown while getting disabled state from sessionStorage: ', ex);
        }

        // If there is already another $infoBar, don't show this
        if (config.$infoBar.filter(':visible').length) {
            this.disabled = true;
        }
    };

    /**
     * Returns selected language's BiDi layout.
     * False = left-to-right layout
     * True = right-to-left layout
     * @param {sting} lang - A language string such as en-US
     */
    InfoBar.prototype.getLanguageBidi = function(lang) {
        // Languages using BiDi (right-to-left) layout
        var LANGUAGES_BIDI = ['he', 'ar', 'fa', 'ur'];

        if (!lang) {
            return false;
        }

        var baseLang = lang.split('-')[0];
        return $.inArray(baseLang, LANGUAGES_BIDI) > -1;
    };

    /**
     * Normalize the user language in the form of ab or ab-CD
     * @param {string} lang - The language string to be normalized
     */
    InfoBar.prototype.normalize = function (lang) {
        return lang.replace(/^(\w+)(?:-(\w+))?$/, function (m, p1, p2) {
            return p1.toLowerCase() + ((p2) ? '-' + p2.toUpperCase() : '');
        });
    };

    /**
     * Gets and sets the list of available languags from either a list of hreflang links
     * or options from a select element. If neither is found, it simply returns false.
     */
    InfoBar.prototype.getAvailableLangs = function() {
        var $links = $('link[hreflang]');
        var $options = $('#page-language-select option');
        var availableLangs = {};

        // Make a dictionary from alternate URLs or a language selector. The key
        // is a language, the value is the relevant <link> or <option> element.
        if ($links.length) {
            $links.each(function () {
                availableLangs[InfoBar.prototype.normalize(this.hreflang)] = this;
            });
            return availableLangs;
        } else if ($options.length) {
            $options.each(function () {
                availableLangs[InfoBar.prototype.normalize(this.value.match(/^\/?([\w\-]+)/)[1])] = this;
            });
            return availableLangs;
        } else {
            // If those lists cannot be found, there is nothing to do
            return false;
        }
    };

    /**
     * Determines whether the users accept language(s) match the current
     * page language.
     * @param {array} acceptLangs - Array of user accept languages
     * @param {string} [pageLang] - The current page language
     */
    InfoBar.prototype.userLangPageLangMatch = function(acceptLangs, pageLang) {

        var match = false;
        config.pageLang = pageLang || config.pageLang;

        $.each(acceptLangs, function(index, userLang) {
            if (config.pageLang === userLang || config.pageLang === userLang.split('-')[0]) {
                match = true;
            }
        });

        return match;
    };

    /**
     * Compares the user’s accept languages against the page’s current
     * language and other available languages to find the best language.
     * @param {array} acceptLangs - Array of user accept languages
     * @param {string} pageLang - The current page language
     */
    InfoBar.prototype.getOfferedLang = function(acceptLangs, pageLang) {
        var shortUserLang = '';
        var offeredLang;

        config.pageLang = pageLang || config.pageLang;
        config.availableLangs = InfoBar.prototype.getAvailableLangs();

        // If there are no available languages, we have nothing to do.
        if (!config.availableLangs) {
            return false;
        }

        // If the users accept language(s) match page lang, we are done.
        if (InfoBar.prototype.userLangPageLangMatch(acceptLangs)) {
            return false;
        }

        // Compare the user's accept languages against available
        // languages to find the best language
        $.each(acceptLangs, function(index, userLang) {

            shortUserLang = userLang.split('-')[0];

            if (userLang in config.availableLangs || shortUserLang in config.availableLangs) {
                offeredLang = userLang;
            }
        });

        // If there is no offered language return false, else true
        return !offeredLang ? false : offeredLang;
    };

    /**
     * Get's the list of the user's acceptLanguages as appropriate for the
     * current browser.
     * @param {array} userLangs - Array of user accept languages
     */
    InfoBar.prototype.getAcceptLangs = function(userLangs) {
        var userAcceptLangs;
        userLangs = userLangs || navigator.languages || navigator.language || navigator.browserLanguage;

        // Note that navigator.language doesn't always work because it's just
        // the application's locale on some browsers. navigator.languages has
        // not been widely implemented yet, but the new property provides an
        // array of the user's accept languages that we'd like to see.
        // navigator.languages are only supported from Firefox/Chrome 32 and
        // not at all by IE, Safari, Opera. navigator.language is not supported
        // by IE so, we need to fallback to navigator.browserLanguage
        if (navigator.languages) {
            // Normalize all language strings for easier comparison.
            userAcceptLangs = $.map(userLangs, function (lang) {
                return InfoBar.prototype.normalize(lang);
            });
        } else if (navigator.language || navigator.browserLanguage) {
            // the above properties only return one item but we need
            // this as an array in the getOfferedLang function.
            userAcceptLangs = [userLangs];
        }

        return userAcceptLangs;
    };

    /**
     * Calls each configured bar's main function
     */
     InfoBar.prototype.call = function() {
         $(config.bars).each(function(index, value) {
             InfoBar[value].call();
         });
     };

    /**
     * Main function called afer document.ready
     * @param {array} acceptLangs - Array of user accept languages
     * @param {string} pageLang - The current page language
     */
    InfoBar.prototype.setup = function(acceptLangs, pageLang) {
        // we want to load the strings for the InfoBar based on the user's acceptLangs
        // if we support the locale. We therefore first see if there is an offered language,
        // else we fall back to the current page language for the strings.
        config.offeredLang = InfoBar.prototype.getOfferedLang(acceptLangs) || pageLang;

        // get and cache all the DOM elements we will need
        config.$message = $('p', config.$infoBar);
        config.$acceptButton = $('.btn-accept', config.$infoBar);
        config.$cancelButton = $('.btn-cancel', config.$infoBar);

        // get the info bar(s) the user wish to apply
        config.bars = config.$infoBar.data('infobar').split(' ');

        try {
            config.json = JSON.parse(sessionStorage.getItem('infobar.json'));
        } catch (ex) {
            console.log('Error thrown while getting json from sessionStorage: ', ex);
        }

        // check if the JSON exists in sessionStorage
        if (!config.json) {
            var jsonURL = 'https://www.mozilla.org/' + config.offeredLang + '/infobar/infobar.jsonp';
             // This loads the data for the transbar which also contains the latest fx version string.
             $.ajax({
                 url: jsonURL,
                 cache: true,
                 crossDomain: true,
                 dataType: 'jsonp',
                 jsonpCallback: '_',
                 success: function(data) {
                     // store the returned JSON in sessionStorage to avoid additional Ajax calls
                     // during this user session.
                     try {
                         sessionStorage.setItem('infobar.json', JSON.stringify(data));
                     } catch(ex) {
                         console.log('Error while storing JSON in sessionStorage: ', ex);
                     }

                     config.json = data;
                     InfoBar.prototype.call();
                 }
             }).fail(function(jqXHR, textStatus, errorThrown) {
                 console.log('Error thrown while loading JSON:');
                 console.log('textStatus: ', textStatus);
                 console.log('errorThrown: ', errorThrown);
             });
        } else {
            // the JSON has already been loaded earlier in this session.
            InfoBar.prototype.call();
        }
    };

    InfoBar.prototype.onshow = {};
    InfoBar.prototype.onaccept = {};
    InfoBar.prototype.oncancel = {};

    /**
     * Attempts to store the disabled status of the specified InfoBar in sessionStorage
     * @param {string} prefName - The stored preference name for this InfoBar
     */
    InfoBar.prototype.setDisabledStatus = function(prefName) {
        try {
            sessionStorage.setItem(prefName, 'true');
        } catch (ex) {
            console.log('oncancel: Error while setting didabled status of InfoBar in sessionStorage');
        }
    };

    /**
     * Shows the relevant bar, binding events to the buttons.
     */
    InfoBar.prototype.show = function () {

        // An infobar can be disabled by pref.
        // Also, ensure there is no current active infobar
        if (this.disabled || config.$infoBar.filter(':visible').length) {
            return;
        }

        var self = this;
        config.bar = self.element = config.$infoBar;

        config.bar.find('.btn-accept').click(function (event) {
            event.preventDefault();

            if (self.onaccept.callback) {
                self.onaccept.callback();
            }

            InfoBar.prototype.setDisabledStatus(self.prefName);
            self.hide();
        });

        config.bar.find('.btn-cancel').click(function (event) {
            event.preventDefault();

            if (self.oncancel.callback) {
                self.oncancel.callback();
            }

            InfoBar.prototype.setDisabledStatus(self.prefName);
            self.hide();
        });

        if (self.onshow.callback) {
            self.onshow.callback();
        }

        if (config.opened) {
            config.bar.toggleClass('hidden');
            config.bar.attr('aria-hidden', true);
        } else {
            config.bar.toggleClass('hidden');
            config.bar.attr('aria-hidden', false);
        }

        return config.bar;
    };

    /**
     * Hides the currently visible infoBar
     */
    InfoBar.prototype.hide = function () {
        var self = this;
        var target = (config.opened) ? self.element : config.bar;

        target.animate({'height': 0}, 200, function () {
            self.element.hide();
            config.bar.attr('aria-hidden', true);
        });
    };

    /**
     * Populates the bar template with the relevant strings.
     * @param {object} content - An object containing the template strings.
     */
    InfoBar.prototype.populateTmpl = function(content) {
        config.$message.text(content.msg);
        config.$acceptButton.text(content.accept);
        config.$cancelButton.text(content.cancel);
    };

    /**
     * Returns true if the current UA is one of the user agents based
     * on Firefox.
     */
    InfoBar.prototype.isLikeFirefox = function(userAgent) {
        var ua = userAgent || navigator.userAgent;
        return (/Iceweasel/i).test(ua) || (/IceCat/i).test(ua) ||
            (/SeaMonkey/i).test(ua) || (/Camino/i).test(ua) ||
            (/like Firefox/i).test(ua);
    };

    /**
     * Rturns true if this is a version of Firefox mobile excluding Firefox for iOS
     */
    InfoBar.prototype.isFirefoxMobile = function(userAgent) {
        var ua = userAgent || navigator.userAgent;
        return /Mobile|Tablet|Fennec/.test(ua);
    };

    /**
     * Returns true if this is *the* Fox
     */
    InfoBar.prototype.isFirefox = function(userAgent) {
        var ua = userAgent || navigator.userAgent;
        return (/\sFirefox/).test(ua) && !InfoBar.prototype.isLikeFirefox(ua);
    };

    /**
     * Returns the users current Firefox version
     */
    InfoBar.prototype.getUserVersion = function(userAgent) {
        var ua = userAgent || navigator.userAgent;
        return parseInt(ua.match(/Firefox\/(\d+)/)[1], 10);
    };

    /**
     * This implements the update bar, shown for Firefox desktop users that has a version
     * installed two major versions older than the latest.
     * @param latestVersion {string} - Latest major version of Firefox (optional)
     * @param buildID {int} - The UA buildID (optional)
     */
    InfoBar.update = function(latestVersion, buildID) {

        var content = {};

        latestVersion = parseInt(latestVersion || config.json.latestfx, 10);
        buildID = buildID || navigator.buildID;

        var updateBar = new InfoBar('update', 'Update Bar');

        var isFirefox = InfoBar.prototype.isFirefox();
        var isMobile = InfoBar.prototype.isFirefoxMobile();
        var isFirefox31ESR = !isMobile && userVersion === 31 && buildID && buildID !== '20140716183446';
        var isNewer = false;
        var userVersion;

        if (isFirefox) {
            userVersion = InfoBar.prototype.getUserVersion();
            isNewer = userVersion > latestVersion;
        }

        if (updateBar.disabled || !isFirefox || isMobile || isFirefox31ESR || isNewer) {
            return false;
        }

        // Show the Update Bar if the user's major version is older than 3 major
        // versions. Once the Mozilla.UITour API starts providing the channel
        // info (Bug 1065525, Firefox 35+), we can show the Bar only to Release
        // channel users. 31 ESR can be detected only with the navigator.buildID
        // property. 20140716183446 is the non-ESR build ID that can be found at
        // https://wiki.mozilla.org/Releases/Firefox_31/Test_Plan
        if (userVersion < latestVersion - 2) {

            content = {
                msg: config.json.update_message,
                accept: config.json.update_accept,
                cancel: config.json.update_cancel
            };

            updateBar.populateTmpl(content);
            updateBar.show();

            // If the user accepts, show the SUMO article
            updateBar.onaccept.callback = function () {
                // leaving this as is for now, in case we want to do some GA measurements later on.
                location.href = 'https://support.mozilla.org/kb/update-firefox-latest-version';
            };

            return true;
        }
    };

    /**
     * Offers the user a link to the current page in their language based on locale.
     * @param {string} pageLang - The current page language
     */
    InfoBar.translate = function(pageLang) {

        var content = {};
        var translationBar = new InfoBar('transbar', 'Translation Bar');
        var isMatch = InfoBar.prototype.userLangPageLangMatch(config.acceptLangs);

        // if the users acceptLangs match the page or, the translationBar is disabled,
        // or there is no config.pageLang set, there is nothing to do.
        if (isMatch || translationBar.disabled || !config.pageLang) {
            return false;
        }

        // Do not show Chrome's built-in Translation Bar
        $('head').append('<meta name="google" value="notranslate">');

        // clear the href of the $acceptButton
        config.$acceptButton.attr('href', '');

        // If the user selects Yes, show the translated page
        translationBar.onaccept = {
            callback: function () {

                // en-US has an hreflang of "en" not "en-US" so, if the user's
                // lang is en-US, shorten it to just "en"
                config.offeredLang = config.offeredLang === 'en-US' ? 'en' : config.offeredLang;
                var element = config.availableLangs[config.offeredLang];

                if (element.form) { // <option>
                    element.selected = true;
                    element.form.submit();
                } else { // <link>
                    location.href = element.href;
                }
            }
        };

        content = {
            msg: config.json.message,
            accept: config.json.accept,
            cancel: config.json.cancel
        };

        translationBar.populateTmpl(content);
        translationBar.show().attr({
            'lang': config.offeredLang,
            'dir': translationBar.getLanguageBidi(config.offeredLang) ? 'rtl' : 'ltr'
        });
    };

    config.$infoBar = $('#mozilla-infobar');
    if (config.$infoBar.length === 0) {
        // No $infoBar element exists, return false;
        return false;
    }

    // get the user's acceptLanguages
    config.acceptLangs = InfoBar.prototype.getAcceptLangs();
    // get the current page's language
    config.pageLang = InfoBar.prototype.normalize(document.documentElement.lang);
    // $infoBar exists, call setup
    InfoBar.prototype.setup(config.acceptLangs, config.pageLang);

    // expose InfoBar to the global scope
    window.InfoBar = InfoBar;

})();

/*global angular, require, module*/
/*jslint browser: true*/

require('templates');
require('interact.js');

var app = angular.module('BuildingBlox.Directives', ['BuildingBlox.Directives.Templates', require('./helpers')])
    .provider('BuildingBloxDirectives', function () {
        'use strict';
        var baseOptions = {
                bootstrap: false
            },
            getValue = function (options, name) {
                return options.hasOwnProperty(name) ? options[name] : baseOptions[name];
            },
            setValue = function (options, name) {
                baseOptions[name] = getValue(options, name);
            };

        function BuildingBloxDirectivesOptions(options) {
            this.bootstrap = options.bootstrap;
        }

        this.init = function (options) {
            setValue(options, 'bootstrap');
        };

        this.$get = [function () {
            return new BuildingBloxDirectivesOptions(baseOptions);
        }];
    });

var exports = app;
module.exports = app;

require('./directives/abbList.js');
require('./directives/dragArea.js');
require('./directives/draggable.js');
require('./directives/draggableList.js');
require('./directives/droparea.js');
require('./directives/hiddenInput.js');
require('./directives/listItem.js');
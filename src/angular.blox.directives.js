/*global angular, require, module*/
/*jslint browser: true*/

require('templates');

var app = angular.module('BuildingBlox.Directives', ['BuildingBlox.Directives.Templates', require('./helpers')])
    .provider('AngularBloxDirectives', function () {
        'use strict';
        var baseOptions = {
                backbone: false
            },
            getValue = function (options, name) {
                return options[name] !== undefined ? options[name] : baseOptions[name];
            };

        function AngularBloxDirectivesOptions(options) {
            this.backbone = options.backbone;
        }

        this.init = function (options) {
            baseOptions.backbone = getValue(options, 'backbone');
        };

        this.$get = [function () {
            return new AngularBloxDirectivesOptions(baseOptions);
        }];
    });

var exports = app;
module.exports = app;

require('./directives/dragArea.js');
require('./directives/draggable.js');
require('./directives/draggableList.js');
require('./directives/droparea.js');
require('./directives/hiddenInput.js');
require('./directives/listItem.js');
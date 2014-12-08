/*global angular, require, module, interact*/
/*jslint browser: true*/

var app = require('../buildingBlox.directives.js');
app.directive('hiddenInput', ['abbArrayHelpers', function (arrayHelpers) {
    'use strict';
    return {
        restrict: 'E',
        template: '<input />',
        replace: true,
        scope: {
        },
        link: function (scope, element) {
            var inputElement = element.find('input'),
                parentAttributes = element[0].attributes;

            arrayHelpers.each(parentAttributes, function (attributeNode) {
                if (attributeNode.value) {
                    inputElement.attr(attributeNode.nodeName, attributeNode.value);
                }
            });

            inputElement.addClass('hiddenInput');
        }
    };
}]);
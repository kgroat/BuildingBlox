/*global angular, require, module*/
/*jslint browser: true*/

var interact = require('interact.js');
var app = require('../buildingBlox.directives.js');
app.directive('dropArea', [function () {
    'use strict';
    return {
        restrict: 'C',
        scope: {
            onDrop: '=',
            onDragEnter: '=',
            onDragLeave: '='
        },
        link: function (scope, element) {
            var htmlElement = element[0],
                interactible;
            interactible = interact(htmlElement);
            interactible.dropzone({
                accept: '.draggable',
                overlap: 'pointer',
                ondragenter: function () {
                    if (!scope.onDragEnter) {
                        return;
                    }
                    var args = arguments;
                    scope.$apply(function () {
                        scope.onDragEnter.apply(scope, args);
                    });
                },
                ondragleave: function () {
                    if (!scope.onDragLeave) {
                        return;
                    }
                    var args = arguments;
                    scope.$apply(function () {
                        scope.onDragLeave.apply(scope, args);
                    });
                },
                ondrop:  function () {
                    if (!scope.onDrop) {
                        return;
                    }
                    var args = arguments;
                    scope.$apply(function () {
                        scope.onDrop.apply(scope, args);
                    });
                }
            });
        }
    };
}]);
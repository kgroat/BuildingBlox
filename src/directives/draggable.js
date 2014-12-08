/*global angular, require, module*/
/*jslint browser: true*/

var interact = window.interact;
var app = require('../buildingBlox.directives.js');
app.directive('draggable', [function () {
    'use strict';
    return {
        restrict: 'C',
        require: '^dragArea',
        link: function (scope, element, attrs, dragAreaController) {
            var htmlElement = element[0],
                interactible;
            interactible = interact(htmlElement);
            interactible.draggable({
                onmove: function (event) {
                    var target = event.target,
                        x = (parseInt(target.getAttribute('data-x'), 10) || 0) + event.dx,
                        y = (parseInt(target.getAttribute('data-y'), 10) || 0) + event.dy;
                    element.css({
                        'transition': '',
                        'z-index': 1000,
                        'transform': 'translate(' + x + 'px, ' + y + 'px)'
                    });
                    element.attr('data-x', x);
                    element.attr('data-y', y);
                    element.addClass('transparent');
                },
                onend: function () {
                    element.css({
                        'z-index': 0,
                        'transform': ''
                    });
                    element.attr('data-x', 0);
                    element.attr('data-y', 0);
                    element.removeClass('transparent');
                }
            });
            interactible.getItem = function () {
                if (scope.item && scope.getIdProperty) {
                    return scope.item;
                }
                return null;
            };
            interactible.remove = function () {
                if (scope.item && scope.getIdProperty && dragAreaController.remove) {
                    dragAreaController.remove(scope.item[scope.getIdProperty()]);
                }
            };
        }
    };
}]);
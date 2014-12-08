/*global angular, require, module*/
/*jslint browser: true*/

var app = require('../buildingBlox.directives.js');
app.directive('listItem', [function () {
    'use strict';
    return {
        restrict: 'E',
        templateUrl: 'src/templates/listItem.html',
        scope: {
            model: '=ngModel',
            displayProperty: '@'
        },
        controller: ['$scope', '$element', function ($scope, $element) {
            $scope.getValue = function () { return $scope.model[$scope.displayProperty || 'value']; };
        }]
    };
}]);
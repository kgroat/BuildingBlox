/*global angular, require, module*/
/*jslint browser: true*/

var interact = require('interact.js');
var app = require('../buildingBlox.directives.js');
app.directive('dragArea', [function () {
    'use strict';
    return {
        restrict: 'C',
        scope: {
            remove: '='
        },
        controller: ['$scope', function ($scope) {
            this.remove = $scope.remove;
        }]
    };
}]);
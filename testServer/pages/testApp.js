/*global angular, require, module*/
/*jslint browser: true*/

var testApp = angular.module('testApp', ['BuildingBlox.Directives']);

testApp.controller('testController', ['$scope', function ($scope) {
    'use strict';
    $scope.testModel = { name: 'first', list: ['world', 'banana', 'kevin'] };
    $scope.testModel2 = { name: 'second', list: ['pasta', 'peanuts'] };
    $scope.testModel3 = { name: 'third', list: ['fire', 'cashews'] };
    $scope.testModel4 = { name: 'fourth', list: ['water', 'ice', 'milk'] };
}]);
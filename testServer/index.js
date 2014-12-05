/*jshint -W024*/
/*jslint node: true*/
'use strict';

var express = require('express');
var http = require('http');
var port = 3000;

var app = express();

app.use('/', express.static(__dirname + '/pages'));
app.use('/dist', express.static(__dirname + '/../dist'));
app.use('/bower_components', express.static(__dirname + '/../bower_components'));

http.createServer(app).listen(port, function () {
    console.log('Express server listening on port ' + port);
});

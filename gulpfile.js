/*jslint node: true*/
'use strict';

var gulp        = require('gulp');
var browserify  = require('gulp-browserify');
var html2Js     = require('gulp-html2js');
var minifyHtml  = require('gulp-minify-html');
var concat      = require('gulp-concat');
var uglify      = require('gulp-uglify');
var rename      = require('gulp-rename');
var del         = require('del');
var sass        = require('gulp-sass');
var sourcemaps  = require('gulp-sourcemaps');

var prod = false;
var paths = {
    templatesFilename: 'templates.js',
    mainFilename: 'buildingBlox.directives.js',
    cssFilename: 'buildingBlox.css',
    tmp: './src/tmp',
    dist: './dist',
    templates: './src/templates/*.html',
    src: './src',
    getMain: function () {
        return this.src + '/' + this.mainFilename;
    },
    getTemplates: function () {
        return this.tmp + '/' + this.templatesFilename;
    },
    getDestination: function () {
        return this.dist + '/' + this.mainFilename;
    },
    makeMinFilename: function (filename) {
        var filenameParts = filename.split('.');
        filenameParts.splice(filenameParts.length - 1, 0, 'min');
        return filenameParts.concat('.');
    },
    getMinFilename: function () {
        return this.makeMinFilename(this.mainFilename);
    },
    getMinDestination: function () {
        return this.dist + '/' + this.getMinFilename();
    },
    getCssDestination: function () {
        return this.dist + '/' + this.cssFilename;
    }
};

gulp.task('clean-tmp', function (cb) {
    del([paths.tmp], cb);
});

gulp.task('clean-dist', function (cb) {
    del([paths.getDestination(), paths.getMinDestination(), paths.getCssDestination()], cb);
});

gulp.task('clean', ['clean-tmp', 'clean-dist']);

gulp.task('html2js', function () {
    var stream = gulp.src(paths.templates);
    if (prod) {
        stream = stream.pipe(minifyHtml({
            empty: true,
            spare: true,
            quotes: true
        }));
    }
    stream = stream.pipe(html2Js({
        outputModuleName: 'BuildingBlox.Directives.Templates'
    }))
        .pipe(concat(paths.templatesFilename))
        .pipe(gulp.dest(paths.tmp));

    return stream;
});

gulp.task('browserify', ['html2js'], function () {
    var stream = gulp.src(paths.getMain())
        .pipe(browserify({
            insertGlobals: false,
            debug: true,
            shim: {
                'templates': {
                    path: paths.getTemplates(),
                    exports: null
                }
            }
        }))
        .pipe(gulp.dest(paths.dist));
    return stream;
});

gulp.task('css', function () {
    gulp.src('./src/scss/index.scss')
        .pipe(sass())
        .pipe(rename(paths.cssFilename))
        .pipe(gulp.dest(paths.dist));
});

gulp.task('watch', function () {
    gulp.watch(paths.src + '/**/*.*', ['browserify', 'css']);
});

gulp.task('dev', ['browserify', 'css', 'watch']);

gulp.task('uglify', ['browserify'], function () {
    gulp.src(paths.getDestination())
        .pipe(uglify())
        .pipe(rename(paths.makeMinFilename))
        .pipe(gulp.dest(paths.dist));
});

gulp.task('default', ['browserify', 'css'], function (cb) {
    del([paths.tmp], cb);
});

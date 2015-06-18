var gulp = require('gulp');
var usemin = require('gulp-usemin');
var ngAnnotate = require('gulp-ng-annotate');
var uglify = require('gulp-uglify');
var minifyHtml = require('gulp-minify-html');
var minifyCss = require('gulp-minify-css');
var rev = require('gulp-rev');
var fs = require('fs-extra');
var path = require('path');
var sourcemaps = require('gulp-sourcemaps');
var ngHtml2Js = require("gulp-ng-html2js");
var concat = require("gulp-concat");


gulp.task('clear-build-folder', function (cb) {
	fs.remove(path.join(__dirname, 'assets', 'bundled'), cb)
});

gulp.task('usemin', ['clear-build-folder'], function () {
	return gulp.src('./views/index.ejs')
		.pipe(usemin({
			assetsDir: './',
			css: ['concat'],
			//html: [minifyHtml({empty: true})],
			jsLib:[rev()],
			jsLibMin: [uglify(), rev()],
			jsApp:[
				sourcemaps.init({
					loadMaps: true
				}),
				ngAnnotate(),
				'concat',
				uglify(),
				rev(),
				sourcemaps.write('./')
			]
		}))
		.pipe(gulp.dest('./'));
});

gulp.task('move-index-prod', ['usemin'], function (done) {
	fs.rename(
		path.join('index.ejs'),
		path.join('views', 'index-prod.ejs'),
		done);
});

gulp.task('template-cache-html', ['clear-build-folder'], function () {
	return gulp.src("./assets/app/**/*.html")
		.pipe(minifyHtml({
			empty: true,
			spare: true,
			quotes: true
		}))
		.pipe(ngHtml2Js({
			moduleName: "bunker",
			prefix: "/assets/app/"
		}))
		.pipe(concat("templates.min.js"))
		.pipe(uglify())
		.pipe(rev())
		.pipe(gulp.dest("./assets/bundled"));
});

gulp.task('production', ['template-cache-html', 'move-index-prod']);

gulp.task('default', ['production']);
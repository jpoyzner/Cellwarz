var gulp = require('gulp');

//TODO: REPLACE JS IN WEBAPP WITH JS DEPLOYED TO S3!!! Then make one gulp task to deploy all JS!!!
gulp.task('default', ['bundle'], function() {
    console.log("deplying Cellwarz JavaScript!");
});

gulp.task('bundle', ['clean'], function() {
	var bundle =
		require('gulp-requirejs')({
	        baseUrl: 'js',
	        name: 'cellwarz',
	        out: 'cellwarz.js',
	        paths: {
	            jquery: '//cdnjs.cloudflare.com/ajax/libs/jquery/2.1.0/jquery.min',
	            jquerymobile: '//cdnjs.cloudflare.com/ajax/libs/jquery-mobile/1.4.1/jquery.mobile.min',
	            underscore: '//cdnjs.cloudflare.com/ajax/libs/underscore.js/1.6.0/underscore-min',
	            backbone: '//cdnjs.cloudflare.com/ajax/libs/backbone.js/1.1.2/backbone-min'
	        }
	    });
    
    bundle.pipe(require('gulp-uglify')()).pipe(gulp.dest('./WebContent/js/'));
});

gulp.task('debug', ['clean'], function() {
	gulp.src('./js/**/*').pipe(gulp.dest('./WebContent/js/'));
});

gulp.task('clean', function(callback) {
	require('del')(["WebContent/js/**/*"], callback);
});


//Unfortunately, gulp-war does not work for websockets when creating war files,
//probably because when eclipse creates war from web project, it optimizes it using
//a specific runtime environment?
//ACTUALLY, IT'S POSSIBLE THE WAR FILE WOULD HAVE WORKED IF U RESTART TOMCAT?
gulp.task('deploy', require('gulp-shell').task([
 "scp -i ../PoyznerKey.pem ../Cellwarz.war ec2-user@52.8.176.59:Cellwarz.war"
]));
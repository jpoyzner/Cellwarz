var gulp = require('gulp');
var shell = require('gulp-shell');
//var war = require('gulp-war');
//var zip = require('gulp-zip');

//gulp.task('war', function () {
//    gulp.src(["WebContent/**"])
//    	.pipe(war({welcome: 'cell.html', displayName: 'Cellwarz WAR'}))
//    	.pipe(zip('Cellwarz.war'))
//        .pipe(gulp.dest(".."));
//});

gulp.task('deploy', shell.task([
   //"sh deploy.sh"
   "scp -i ../PoyznerKey.pem ../Cellwarz.war ec2-user@52.8.176.59:Cellwarz.war"
 ]));

gulp.task('default', ['deploy'], function() {
    console.log("Finished Cellwarz tasks!");
});
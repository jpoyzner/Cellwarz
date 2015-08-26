var gulp = require('gulp');
var shell = require('gulp-shell');

gulp.task('deploy', shell.task([
   "scp -i ../PoyznerKey.pem ../Cellwarz.war ec2-user@52.8.176.59:Cellwarz.war"
 ]));

gulp.task('default', ['deploy'], function() {
    console.log("Finished Cellwarz tasks!");
});
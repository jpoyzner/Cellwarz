requirejs.config({
    paths: {
        jquery: '//cdnjs.cloudflare.com/ajax/libs/jquery/2.1.0/jquery.min',
        underscore: '//cdnjs.cloudflare.com/ajax/libs/underscore.js/1.6.0/underscore-min',
        backbone: '//cdnjs.cloudflare.com/ajax/libs/backbone.js/1.1.2/backbone-min'
    }
});

requirejs(['jquery', 'canvas'], function($, Canvas) {
	window.scrollTo(0, 0);
	
	$('#enter').click(function(e) {
		e.preventDefault(); //TODO: why the hell is this a form button?
		new Canvas({jump: false});
	});
	
	$('#random').click(function(e) {
		e.preventDefault(); //TODO: why the hell is this a form button?
		new Canvas({jump: true});
	});
});
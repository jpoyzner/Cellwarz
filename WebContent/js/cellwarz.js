$(document).ready(function() {
	window.scrollTo(0, 0);
	
	$('#enter').click(function(e) {
		init(e, false);
	});
	
	$('#random').click(function(e) {
		init(e, true);
	});
});

function init(e, jump) {
	e.preventDefault();
	
	loginName = $('#loginName').val();
	if (loginName.length != 0) {
		$('#login').remove();
		
		canvas = $('#canvas').get(0);
		ctx = canvas.getContext('2d');
		ctx.globalAlpha = 1;
		
		$('#mana1').show();
		$('#mana2').show();
		$('#mana3').show();
		
		engineFramesPerSecond = 48;
		refreshRate = 1000 / engineFramesPerSecond;
		inactivityTimeout = 3000;
		timedOut = false;
		timedOutCount = 0;
		totalReqCount = 0;
		needsRefresh = false;
		
		refresh(true, jump);
	}
}
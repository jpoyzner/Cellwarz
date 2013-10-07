////NOT USED BUT MAKE SURE THE LOGIC BEHIND ALL OF THESE IS IMPLEMENTED, then remove file and import

function poll() {
	if (inactivityCount < inactivityTimeout) {
		//reset keys if timed out
		if (timedOut) {
			for (var i = 0; i < keydowns.length; i++) {
				keyups[keyups.length] = keydowns[i];
			}
		}
		
		if (totalReqCount % (engineFramesPerSecond * 3) == 0) {
			refresh(false, false);
		}
		
		if (needsRefresh) {
			refresh(true, false);
			return;
		}
		
		ajaxSync();
		
		inactivityCount++;
		totalReqCount++;
		
		if (totalReqCount % 250 == 0) {
			totalReqCount = 0;
			timedOutCount = 0;
		}
		
		if (keydowns.length != 0) {
			keydowns = new Array();
			inactivityCount = 0;
		}
		
		if (keyups.length != 0) {
			keyups = new Array();
			inactivityCount = 0;
		}
	} else if (inactivityCount == inactivityTimeout) {
		ctx.fillStyle = "gray";
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		drawSprites();
		inactivityCount++;
		//sync();
	} else if (keydowns.length != 0 || keyups.length != 0) {
		refresh(true, false);
	} else {
		//sync();
	}
}

function ajaxSync() {
	$.ajax({
		type: 'POST',
		url: '/Cellwarz/sync',
		data: {login: loginName, keydowns: JSON.stringify(keydowns), keyups: JSON.stringify(keyups)},
		success: function(data) {
			render(data);
		}, timeout: 100}) //This has to be a balance between requests that stall and requests that take too long ...
	.fail(function() {
		//sync();
		timedOut = true;
		timedOutCount++;
	});
}
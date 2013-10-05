function refresh(init, jump) {
	if (init) {
		images = new Array();
		keydowns = new Array();
		keyups = new Array();
		
		inactivityCount = 0;
		text = "";
		cellText = "";
	}
	
	$.post(
		'/Cellwarz/refresh',
		{login: loginName, jump: jump},	
		function(data) {
			sprites = data.sprites;
			
			if (init) {
				avatars = data.avatars;
				tools = data.tools;
				
				imagePaths = data.imagePaths;
				for (var i = 0; i < imagePaths.length; i++) {	
					image = new Image();
					image.src = imagePaths[i];
					images[i] = image;
				}
				
				needsRefresh = false;
				sync();
			}
		}).fail(function() {
			refresh(init, jump);
		});
}
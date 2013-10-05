function load(data) {
	for (var i = 0; i < spriteIds.length; i++) {
		if (spriteIds[i] == "message") {
			cellText = data["message"];
		} else {
			spriteId = spriteIds[i];
			newSprite = data[spriteId];
			
			if (newSprite[0] == "-1") {
				if (sprites[spriteId]) {
					delete sprites[spriteId];
				}
			} else {
				sprites[spriteId] = [newSprite[0], newSprite[1], newSprite[2]];
				
				extraInfo = newSprite[3];
				if (extraInfo) {
					avatarName = extraInfo["0"];
					if (avatarName) {
						avatars[avatarName] = spriteId;
					}
					
					newTools = extraInfo["1"];
					if (newTools) {
						if (newTools["-1"]) {
							$('#mana1').css('background-image', 'none');
						} else {
							tools = newTools;
						}
					}
				}
			}
		}
	}
}
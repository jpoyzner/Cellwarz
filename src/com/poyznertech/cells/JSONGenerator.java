package com.poyznertech.cells;

import java.util.List;

import net.sf.json.JSONArray;
import net.sf.json.JSONObject;

import com.poyznertech.cells.sprite.Avatar;
import com.poyznertech.cells.sprite.Mana;
import com.poyznertech.cells.sprite.Sprite;
import com.poyznertech.cells.sprite.Structure;

public class JSONGenerator {
	private static final int DELETED_CODE = -1;
	private static final String AVATAR_NAME_KEY = "0";
	private static final String DASHBOARD_IMAGE_KEY = "1";
	private static final String TOOLS_DELETED_KEY = "-1";
	
	/**
	 * A json list of sprites in an exact order used in js, extra info should be attached to appropriate json sprite here
	 * to make these frequent requests more lightweight.
	 */
	static JSONObject getSprites(List<Sprite> sprites, boolean addExtraInfo, Avatar sessionAvatar) {//, boolean needsRefresh) {
		JSONObject extraToolsInfo = null;
		if (addExtraInfo && sessionAvatar.needsStructureChangeUpdate()) {
			extraToolsInfo = getTools(sessionAvatar);
		}
		
		JSONObject jsonSprites = new JSONObject();
		for (Sprite sprite: sprites) {
			JSONArray jsonSprite = new JSONArray();
			if (sprite.removed()) {
				jsonSprite.element(DELETED_CODE);
			} else {
				jsonSprite.element(sprite.getImageIndex()).element(sprite.getXPixels()).element(sprite.getYPixels());
				
				if (addExtraInfo && sprite instanceof Avatar) {
					JSONObject extraInfo = null;
					Avatar avatar = (Avatar)sprite;
					
					if (avatar.showName()) {
						extraInfo = new JSONObject().element(AVATAR_NAME_KEY, avatar.getName());
					}
					
					if (avatar == sessionAvatar) {
						if (extraToolsInfo != null) {
							if (extraInfo == null) {
								extraInfo = new JSONObject();
							}
							
							extraInfo.element(DASHBOARD_IMAGE_KEY, extraToolsInfo);
						}
					}
					
					if (extraInfo != null) {
						jsonSprite.element(extraInfo);
					}
				}
			}
			
			jsonSprites.element(String.valueOf(sprite.getCellIndex()), jsonSprite);
		}
		return jsonSprites;
	}
	
	static JSONObject getTools(Avatar avatar) {
		JSONObject tools = new JSONObject();
		Structure structure = avatar.getStructure();
		if (structure == null) {
			tools.element(TOOLS_DELETED_KEY, DELETED_CODE);
		}
		else {
			List<Mana> manas = structure.getManas();
			for (int i = 0; i < manas.size(); i++) {
				tools.element(String.valueOf(i), manas.get(i).getDashboardImageIndex());
			}
		}
		return tools;
	}
}

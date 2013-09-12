package com.poyznertech.cells;

import java.util.HashSet;
import java.util.Set;

import com.poyznertech.cells.sprite.Sprite;
import com.poyznertech.cells.sprite.Stable;

public class Physics {
	public static final int UP = -1;
	public static final int RIGHT = 1;
	public static final int DOWN = 1;
	public static final int LEFT = -1;
	public static final int NONE = 0;
	
	public static final int EFFECTS_LAYER = 0;
	public static final int LEVEL_LAYER = 1;
	public static final int OBJECT_LAYER = 2;
	public static final int BACKGROUND_LAYER = 3;
	
	private static final int GRAVITY_ACCELERATION_INTERVAL = 5;
	
	static final int FALL_DISTANCE = 2;
	
	public final boolean gravitate(Sprite sprite) {
		if (sprite.getMass() == 0) {
			return false;
		}
		
		boolean fell = move(sprite, NONE, DOWN, FALL_DISTANCE + sprite.getGravitateCount() / GRAVITY_ACCELERATION_INTERVAL);
		if (fell) {
			sprite.addGravitateCount();
		} else {
			sprite.resetGravitateCount();
		}
		
		return fell;
	}
	
	/**
	 * Basic move
	 */
	public final boolean move(Sprite sprite, int xDirection, int yDirection, int distance) {
		return move(sprite, xDirection, yDirection, distance, true);
	}
	
	/**
	 * Move which pushes
	 */
	private final boolean move(Sprite sprite, int xDirection, int yDirection, int distance, boolean push) {
		for (int i = 0; i < distance; i++) {
			if (touchSprite(sprite, xDirection, yDirection, push)) {
				return false;
			}
			
			Set<Sprite> spritesOnTop = null;
			boolean falling = push && yDirection == DOWN;
			
			if (falling) {
				spritesOnTop = getSpritesAbove(sprite, xDirection, 0);
			}
			
			sprite.getCellData().move(sprite, xDirection, yDirection);
			
			if (falling) {
				for (Sprite spriteOnTop: spritesOnTop) { 
					if (!(spriteOnTop instanceof Stable)) {
						move(spriteOnTop, NONE, DOWN, 1);
					}
				}
			}
		}
		
		return true;
	}
	
	/**
	 * Checks if touching or close to touching
	 */
	public final boolean reachSprite(Sprite sprite, int xDirection, int yDirection, int totalReach) {
		for (int i = 0; i < totalReach; i++) {
			if (touchSprite(sprite, xDirection, yDirection, i, false)) {
				return true;
			}
		}
		
		return false;
	}
	
	public final boolean touchSprite(Sprite sprite, int xDirection, int yDirection, boolean push) {
		return touchSprite(sprite, xDirection, yDirection, Physics.NONE, push);
	}
	
	/**
	 * Main algorithm method for checking if touching or close. Also can push other sprites as necessary.
	 */
	final boolean touchSprite(Sprite sprite, int xDirection, int yDirection, int extraReach, boolean push) {
		Set<Sprite> pushedSprites = new HashSet<Sprite>();
		Set<Sprite> spritesOnTop = getSpritesAbove(sprite, xDirection, extraReach);

		if (yDirection == UP || yDirection == DOWN) {
			for (Sprite spriteAtPosition: yDirection == UP ? spritesOnTop : getSpritesUnder(sprite, xDirection, extraReach)) {
				if (canInteract(sprite, spriteAtPosition)) {
					if (!push || sprite.getMass() < spriteAtPosition.getMass()) {
						return true;
					}
					
					pushedSprites.add(spriteAtPosition);
				}
			}
		}

		if (xDirection == LEFT || xDirection == RIGHT) {
			for (int row = 0; row < sprite.getClippedHeight(); row++) {
				try {
					Set<Sprite> spritesAtPosition =
						sprite.getCellData().getMapPosition(
							sprite.getClippedX() + (xDirection == LEFT ? LEFT - extraReach : (sprite.getClippedWidth() + extraReach)),
							sprite.getClippedY() + yDirection + row);
					
					if (spritesAtPosition != null && !spritesAtPosition.isEmpty()) {
						for (Sprite spriteAtPosition: spritesAtPosition) {
							if (canInteract(sprite, spriteAtPosition)) {
								if (!push || sprite.getMass() < spriteAtPosition.getMass()) {
									return true;
								}
								
								pushedSprites.add(spriteAtPosition);
							}
						}
					}
				} catch (EdgeOfCellDataException e) {}
			}
			
			if (push && !sprite.isEffect()) {
				for (Sprite spriteOnTop: spritesOnTop) {
					if (!(spriteOnTop instanceof Stable)) {
						move(spriteOnTop, xDirection, NONE, 1);
					}
				}
			}
		}
		
		for (Sprite pushedSprite: pushedSprites) {
			if (!move(pushedSprite, xDirection, yDirection, 1, false)) {
				return true;
			}
		}
		
		return false;
	}
	
	public final Set<Sprite> getSpritesAbove(Sprite sprite, int xDirection, int extraReach) {
		Set<Sprite> spritesOnTop = new HashSet<Sprite>();
		
		try {
			for (int column = 0; column < sprite.getClippedWidth(); column++) {
				Set<Sprite> spritesAtPosition =
					sprite.getCellData()
						.getMapPosition(sprite.getClippedX() + xDirection + column, sprite.getClippedY() - 1 - extraReach);
				
				if (spritesAtPosition != null && !spritesAtPosition.isEmpty()) {
					spritesOnTop.addAll(spritesAtPosition);
				}
			}
		} catch (EdgeOfCellDataException e) {}
		
		return spritesOnTop;
	}
	
	public final Set<Sprite> getSpritesUnder(Sprite sprite, int xDirection, int extraReach) {
		Set<Sprite> spritesUnder = new HashSet<Sprite>();
		
		try {
			for (int column = 0; column < sprite.getClippedWidth(); column++) {
				Set<Sprite> spritesAtPosition =
					sprite.getCellData().getMapPosition(
						sprite.getClippedX() + xDirection + column,
						sprite.getClippedY() + sprite.getClippedHeight() + extraReach);
				
				if (spritesAtPosition != null && !spritesAtPosition.isEmpty()) {
					spritesUnder.addAll(spritesAtPosition);
				}
			}
		} catch (EdgeOfCellDataException e) {}
		
		return spritesUnder;
	}
	
	public final void moveTo(Sprite sprite, int x, int y) {
		sprite.getCellData().moveTo(sprite, x, y);
	}
	
	
	//TODO: consider adding an event system instead in cell data that would mark when things appear together
	public final Set<Sprite> getSpritesAtSamePosition(Sprite sprite) {
		Set<Sprite> sprites = new HashSet<Sprite>();
		for (int column = sprite.getClippedX(); column < sprite.getClippedWidth() + sprite.getClippedX(); column++) {
			for (int row = sprite.getClippedY(); row < sprite.getClippedHeight() + sprite.getClippedY(); row++) {
				try {
					Set<Sprite> spritesAtPosition = sprite.getCellData().getMapPosition(column, row);
					if (spritesAtPosition != null) {
						sprites.addAll(spritesAtPosition);
					}
				} catch (EdgeOfCellDataException e) {}
			}
		}
		
		return sprites;
	}
	
	private final boolean canInteract(Sprite sourceSprite, Sprite targetSprite) {
		return targetSprite != sourceSprite
			&& targetSprite.getLayer() <= sourceSprite.getLayer()
			&& !(targetSprite.melts()
			&& sourceSprite.melts());
	}
}

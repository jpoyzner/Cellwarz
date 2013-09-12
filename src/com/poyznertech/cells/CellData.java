package com.poyznertech.cells;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import com.poyznertech.cells.sprite.Sprite;

public class CellData {
	public final static int ANIMATION_STEP = 8;
	
	private final World world;
	private final List<Sprite> sprites;
	private List<String> imagePaths;
	private int spriteCount;
	
	private final Set<Sprite>[][] map;
	
	@SuppressWarnings("unchecked")
	public CellData(int cellWidth, int cellHeight, World world) {
		this.world = world;
		sprites = new ArrayList<Sprite>();
		map = new Set[cellWidth][cellHeight];
		imagePaths = new ArrayList<String>();
		spriteCount = 0;
	}
	
	public int add(Sprite sprite, boolean cellInit) throws ClusteredInitException {
		if (cellInit && world.getPhysics().getSpritesAtSamePosition(sprite).size() > 0) {
			throw new ClusteredInitException();
		}
		
		sprites.add(sprite);
		
		try {
			writeData(sprite, true);
			applyClipping(sprite);
			return spriteCount++;
		} catch (EdgeOfCellDataException e) {
			sprites.remove(sprite);
			return -1;
		}
	}
	
	public void remove(Sprite sprite) {
		sprites.remove(sprite);
		
		try {
			writeData(sprite, false);
		} catch (EdgeOfCellDataException e) {}
	}
	
	final void move(Sprite sprite, int xDirection, int yDirection) {
		try {
			writeData(sprite, false);
			sprite.changeXBy(xDirection);
			sprite.changeYBy(yDirection);
			writeData(sprite, true);
			applyClipping(sprite);
			sprite.needsRedraw(true);
		} catch (EdgeOfCellDataException e) {
			sprite.removePermanently();
		}
	}
	
	final void moveTo(Sprite sprite, int x, int y) {
		try {
			writeData(sprite, false);
			sprite.setX(x);
			sprite.setY(y);
			writeData(sprite, true);
			applyClipping(sprite);
			sprite.needsRedraw(true);
		} catch (EdgeOfCellDataException e) {
			sprite.removePermanently();
		}
	}
	
	private final void applyClipping(Sprite sprite) throws EdgeOfCellDataException {
		sprite.setClippedX(sprite.getX());
		sprite.setClippedY(sprite.getY());
		sprite.setClippedWidth(sprite.getWidth());
		sprite.setClippedHeight(sprite.getHeight());
		
		Frame currentFrame = sprite.getCurrentFrame();
		adjustClipping(sprite, -currentFrame.getTopClip(), -currentFrame.getRightClip(), -currentFrame.getBottomClip(), -currentFrame.getLeftClip());
	}
	
	private final void writeData(Sprite sprite, boolean save) throws EdgeOfCellDataException {
		writeData(sprite, sprite.getX(), sprite.getY(), sprite.getWidth(), sprite.getHeight(), save);
	}
	
	public final void adjustClipping(Sprite sprite, int topAdjustment, int rightAdjustment, int bottomAdjustment, int leftAdjustment) throws EdgeOfCellDataException {
		if (topAdjustment < 0 || bottomAdjustment < 0) {
			if (topAdjustment < 0) {
				writeData(sprite, sprite.getX(), sprite.getY(), sprite.getWidth(), -topAdjustment, false);
				sprite.setClippedY(sprite.getY() - topAdjustment);
			}
			
			if (bottomAdjustment < 0) {
				writeData(sprite, sprite.getX(), sprite.getY() + sprite.getHeight() + bottomAdjustment - 1, sprite.getWidth(), -bottomAdjustment, false);
			}
			
			sprite.setClippedHeight(sprite.getHeight() + topAdjustment + bottomAdjustment);
		}
		
		if (leftAdjustment < 0 || rightAdjustment < 0) {
			if (leftAdjustment < 0) {
				writeData(sprite, sprite.getX(), sprite.getY(), -leftAdjustment, sprite.getHeight(), false);
				sprite.setClippedX(sprite.getX() - leftAdjustment);
			}
			
			if (rightAdjustment < 0) {
				writeData(sprite, sprite.getX() + sprite.getWidth() + rightAdjustment - 1, sprite.getY(), -rightAdjustment, sprite.getHeight(), false);
			}
			
			sprite.setClippedWidth(sprite.getWidth() + leftAdjustment + rightAdjustment);
		}
	}
	
	@SuppressWarnings({"rawtypes", "unchecked"})
	private final void writeData(Sprite sprite, int x, int y, int width, int height, boolean save) throws EdgeOfCellDataException {
		for (int i = 0; i < width; i++) {
			for (int j = 0; j < height; j++) {
				Set spritesAtPosition = getMapPosition(x + i, y + j);
				
				if (save) {
					if (spritesAtPosition == null) {
						//TODO: we might want to do some optimization when saving to DB by not writing empty lists
						
						spritesAtPosition = new HashSet();
						map[x + i][y + j] = spritesAtPosition;
					}
					
					spritesAtPosition.add(sprite);
				} else {
					spritesAtPosition.remove(sprite);
				}
			}
		}
	}
	
	public final int addImage(String path) {
		String fullPath = Sprite.DEFAULT_IMAGE_DIR + path + ".png";
		
		if (imagePaths.contains(fullPath)) {
			return imagePaths.indexOf(fullPath);
		}
		
		imagePaths.add(fullPath);
		return imagePaths.size() - 1;
	}
	
	public List<Sprite> getSprites() {
		return new ArrayList<Sprite>(sprites);
	}

	public Set<Sprite> getMapPosition(int x, int y) throws EdgeOfCellDataException {
		try {
			return map[x][y];
		} catch (IndexOutOfBoundsException e) {
			throw new EdgeOfCellDataException();
		}
	}
	
	public List<String> getImagePaths() {
		return imagePaths;
	}
}

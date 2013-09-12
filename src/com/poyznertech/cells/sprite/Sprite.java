package com.poyznertech.cells.sprite;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import com.poyznertech.cells.Cell;
import com.poyznertech.cells.CellData;
import com.poyznertech.cells.ClusteredInitException;
import com.poyznertech.cells.EdgeOfCellDataException;
import com.poyznertech.cells.Engine;
import com.poyznertech.cells.Force;
import com.poyznertech.cells.Frame;
import com.poyznertech.cells.Physics;

public abstract class Sprite {
	public static final String DEFAULT_IMAGE_DIR = "images/";
	
	static final String DEFAULT_ACTION = "none";
	
	private final int cellIndex;
	
	private int x;
	private int y;

	private int clippedX;
	private int clippedY;
	private int clippedWidth;
	private int clippedHeight;

	String animationSequence;
	private int currentFrameIndex;
	private boolean needsRedraw;
	private int redrawEcho;
	private int removedEcho;
	private boolean removed;
	private boolean toDelete;
	
	private Force force;
	private int gravitateCount;
	
	final Cell cell;
	final CellData cellData;
	final Physics physics;
	final Engine engine;
	
	public Sprite(int x, int y, boolean cellInit, Cell cell) throws ClusteredInitException {
		this.cell = cell;
		cellData = cell.getCellData();
		physics = cell.getWorld().getPhysics();
		engine = cell.getEngine();
		
		this.x = x;
		this.y = y;
		clippedX = x;
		clippedY = y;
		clippedWidth = getWidth();
		clippedHeight = getHeight();
		
		animationSequence = getDefaultAction();
		
		currentFrameIndex = 0;
		redrawEcho = 0;
		removedEcho = 0;
		removed = false;
		toDelete = false;
		cellIndex = cellData.add(this, cellInit);
		
		resetGravitateCount();
	}
	
	public final CellData getCellData() {
		return cellData;
	}
	
	public int getCellIndex() {
		return cellIndex;
	}
	
	public int getX() {
		return x;
	}
	
	public void changeXBy(int delta) {
		x += delta;
		clippedX += delta;
	}
	
	public int getClippedX() {
		return clippedX;
	}
	
	public void setClippedX(int clippedX) {
		this.clippedX = clippedX;
	}
	
	public int getXPixels() {
		return x * CellData.ANIMATION_STEP;
	}
	
	public void setX(int x) {
		this.x = x;
	}

	public int getY() {
		return y;
	}
	
	public void changeYBy(int delta) {
		y += delta;
		clippedY += delta;
	}
	
	public int getClippedY() {
		return clippedY;
	}
	
	public void setClippedY(int clippedY) {
		this.clippedY = clippedY;
	}
	
	public int getYPixels() {
		return y * CellData.ANIMATION_STEP;
	}
	
	public void setY(int y) {
		this.y = y;
	}
	
	public int getClippedWidth() {
		return clippedWidth;
	}
	
	public void setClippedWidth(int clippedWidth) {
		this.clippedWidth = clippedWidth;
	}
	
	public int getClippedHeight() {
		return clippedHeight;
	}
	
	public void setClippedHeight(int clippedHeight) {
		this.clippedHeight = clippedHeight;
	}

	static void addActions(CellData cellData, String action, String path, int numFrames, Map<String, List<Frame>> actionFrames) {
		addAction(cellData, action, path, numFrames, false, actionFrames);
	}
	
	static void addAction(CellData cellData, String action, String path, int numFrames, boolean mirror, Map<String, List<Frame>> actionFrames) {
		addAction(cellData, action, path, numFrames, 0, 0, 0, 0, mirror, actionFrames);
	}
	
	static void addAction(CellData cellData, String action, String path, int numFrames, int topClip, int rightClip, int bottomClip, int leftClip, boolean mirror, Map<String, List<Frame>> actionFrames) {
		List<Frame> frames = new ArrayList<Frame>(numFrames);
		for (int i = 0; i < numFrames; i++) {
			frames.add(new Frame(cellData.addImage(path + (numFrames == 1 ? "" : (i + 1)) + (mirror ? "L" : "")), topClip, rightClip, bottomClip, leftClip));
		}
		actionFrames.put(action, frames);
	}
	
	static int addImage(CellData cellData, String path) {
		return cellData.addImage(path);
	}
	
	public String getAnimationSequence() {
		return animationSequence;
	}

	//It's questionable whether we ever want to utilize the boolean return here. For example, should a bigger content area dictate the physics behind it? Probably not.
	public boolean setAnimationSequence(String animationSequence) {
		if (animationSequence != this.animationSequence) {
			String oldAnimationSequence = this.animationSequence;
			int oldFrameIndex = currentFrameIndex;
			boolean redraw = true;
			
			Frame oldFrame = getCurrentFrame();
			this.animationSequence = animationSequence;
			currentFrameIndex = 0;
			Frame newFrame = getCurrentFrame();
			
			
			//These four adjustments are for when the clipping gets smaller on a particular side (content gets bigger),
			//then it checks to make sure there's room for extra sprite content on that side.
			int topAdjustment = oldFrame.getTopClip() - newFrame.getTopClip();
			if (topAdjustment > 0 && physics.reachSprite(this, Physics.NONE, Physics.UP, topAdjustment)) {
				redraw = false;
			}
			
			int rightAdjustment = oldFrame.getRightClip() - newFrame.getRightClip();
			if (rightAdjustment > 0 && physics.reachSprite(this, Physics.RIGHT, Physics.NONE, rightAdjustment)) {
				redraw = false;
			}
			
			int bottomAdjustment = oldFrame.getBottomClip() - newFrame.getBottomClip();
			if (bottomAdjustment > 0 && physics.reachSprite(this, Physics.NONE, Physics.DOWN, bottomAdjustment)) {
				redraw = false;
			}
			
			int leftAdjustment = oldFrame.getLeftClip() - newFrame.getLeftClip();
			if (leftAdjustment > 0 && physics.reachSprite(this, Physics.LEFT, Physics.NONE, leftAdjustment)) {
				redraw = false;
			}
			
			if (redraw) {
				try {
					cellData.adjustClipping(this, topAdjustment, rightAdjustment, bottomAdjustment, leftAdjustment);
				} catch (EdgeOfCellDataException e) {}
			} else {
				this.animationSequence = oldAnimationSequence;
				currentFrameIndex = oldFrameIndex;
			}
			
			return redraw;
		}
		
		return true;
	}

	public int getFrame() {
		return currentFrameIndex;
	}

	public void setFrame(int frame) {
		this.currentFrameIndex = frame;
	}
	
	public int getImageIndex() {
		return getCurrentFrame().getImageIndex();
	}
	
	public final void process() {
		if (removed()) {
			if (removedEcho == 0) {
				if (toDelete) {
					delete();
				}
				
				removedEcho--;
				needsRedraw = false;
			} else if (removedEcho > 0) {
				removedEcho--;
				needsRedraw = true;
			}
		} else {
			needsRedraw = needsRedraw || redrawEcho > 0;
	
			if (animate() && engine.shouldAnimateFrame(this)) {
				if (currentFrameIndex == getActionFrames().get(animationSequence).size() - 1) {
					currentFrameIndex = 0;
				} else {
					currentFrameIndex++;
				}
				
				needsRedraw = true;
				redrawEcho = Engine.REDRAW_ECHO_FRAMES;
			} else if (redrawEcho != 0) {
				redrawEcho--;
			}
			
			doAction();
		}
	}
	
	public final Frame getCurrentFrame() {
		return getActionFrames().get(animationSequence).get(currentFrameIndex);
	}
	
	String getDefaultAction() {
		return DEFAULT_ACTION;
	}
	
	void doAction() {}
	
	boolean animate() {
		return false;
	}
	
	public int getAnimationFrequency() {
		return Engine.ALL_STEPS;
	}
	
	public final boolean needsRedraw() {
		return needsRedraw;
	}
	
	public final void needsRedraw(boolean value) {
		needsRedraw = value;
	}
	
	public final void delete() {
		cellData.remove(this);
	}
	
	public final boolean removed() {
		return removed;
	}
	
	public final void remove() {
		removed = true;
		removedEcho = Engine.REDRAW_ECHO_FRAMES;
	}
	
	public final void removePermanently() {
		removed = true;
		removedEcho = Engine.REDRAW_ECHO_FRAMES;
		toDelete = true;
	}
	
	public final void replace() {
		removed = false;
	}
	
	public boolean melts() {
		return false;
	}
	
	public int getMass() {
		return 1;
	}

	public Force getForce() {
		return force;
	}

	public Force setForce(int xDirection, int yDirection) {
		force = new Force(xDirection, yDirection, getMass());
		return force;
	}

	public int getGravitateCount() {
		return gravitateCount;
	}

	public void addGravitateCount() {
		gravitateCount++;
	}
	
	public void resetGravitateCount() {
		gravitateCount = 0;
	}
	
	public boolean isEffect() {
		return false;
	}
	
	public Cell getCell() {
		return cell;
	}

	abstract public int getWidth();
	abstract public int getHeight();
	abstract public int getLayer();
	
	abstract public Map<String, List<Frame>> getActionFrames();
}
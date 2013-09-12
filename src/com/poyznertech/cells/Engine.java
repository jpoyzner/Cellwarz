package com.poyznertech.cells;

import java.util.ArrayList;
import java.util.List;
import java.util.Timer;
import java.util.TimerTask;

import com.poyznertech.cells.sprite.Sprite;

public class Engine {
	//TODO: at some point will have to deal with limiting a browser/computer to use more than one cellwarz screen.
	//It messes up the ajax call timing mechanism (esp. when on the same browser like firefox)
	
	static final int ENGINE_FRAMES_PER_SECOND = 48;

	//might not need it to be this much; also could be variable based on connection.
	public static final int REDRAW_ECHO_FRAMES = 10; 
	
	public static final int ALL_STEPS = 1;
	public static final int HALF_STEP = 2;
	public static final int QUARTER_STEP = 4;
	public static final int EIGHTH_STEP = 8;
	public static final int SIXTEENTH_STEP = 16;
	public static final int EVERY_SECOND = ENGINE_FRAMES_PER_SECOND;
	public static final int SECONDS_REFRESH_INTERVAL = 3;
	
	private final Cell cell;
	private List<Sprite> redrawSprites;
	private int frameNumber;
		
	public Engine(Cell cell) {
		this.cell = cell;
		cell.setEngine(this);
		frameNumber = 0;
	}
	
	//TODO: the tough part will be to manage threads to run all of these cells, freeze inactive cells?
	
	final void start() {
		new Timer().schedule(
			new TimerTask() {
				public void run() {
					List<Sprite> newRedrawSprites = new ArrayList<Sprite>(); //TODO: The sprites should be processed closer to together when they will be used simultaneously?
					
					for (Sprite sprite: cell.getCellData().getSprites()) {
						sprite.process();
						
						if (sprite.needsRedraw()) {
							newRedrawSprites.add(sprite);
						}
					}
					
					cell.process();
					
					if (frameNumber == ENGINE_FRAMES_PER_SECOND - 1) {
						frameNumber = 0;
					} else {
						frameNumber++;
					}
					
					redrawSprites = newRedrawSprites;
				}
			},
			0,
			1000 / ENGINE_FRAMES_PER_SECOND);
	}
	
	public final boolean shouldAnimateFrame(Sprite sprite) {
		return frameNumber % sprite.getAnimationFrequency() == 0;
	}
	
	public final int getAnimationsPerSecond(Sprite sprite) {
		return ENGINE_FRAMES_PER_SECOND / sprite.getAnimationFrequency();
	}
	
	public final boolean actionMatchesFrequency(int frequency) {
		return frameNumber % frequency == 0;
	}

	public List<Sprite> getRedrawSprites() {
		return redrawSprites;
	}

	public Cell getCell() {
		return cell;
	}
}

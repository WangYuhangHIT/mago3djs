'use strict';

/**
 * This class is used to render the earth.
 * @class TinTerrain
 */
var TinTerrain = function(owner) 
{
	if (!(this instanceof TinTerrain)) 
	{
		throw new Error(Messages.CONSTRUCT_ERROR);
	}
	
	
	this.owner; // undefined if depth = 0.
	this.depth; 
	if (owner)
	{
		this.owner = owner;
		this.depth = owner.depth + 1;
	}
	else 
	{
		this.depth = 0;
	}
	
	this.childArray; // child array.
	this.childMap; // example: this.childMap["LU"] = tinTerrainChild.
	
	// Data.
	this.X; // tile index X.
	this.Y; // tile index Y.
	
	// CencerPosition.
	this.centerX; // Float64Array.
	this.centerY; // Float64Array.
	this.centerZ; // Float64Array.
	
	// positions(x, y, z), normals, texCoords, colors & indices array.
	this.cartesiansArray;
	this.normalsArray;
	this.texCoordsArray;
	this.colorsArray;
	this.indices;
	
	this.skirtCartesiansArray;
	this.skirtTexCoordsArray;
	
	// Tile extent.
	this.geographicExtent;
	this.sphereExtent;
	this.webMercatorExtent;
	
	// Tile geometry data.
	this.fileLoadState = 0;
	this.dataArrayBuffer;
	this.vboKeyContainer; // class: VBOVertexIdxCacheKeysContainer.
	this.terrainPositionHIGH;
	this.terrainPositionLOW;
	
	this.indexName; // example: "LU".
	this.pathName; // example: "14//4567//516".
	this.texture = {};
	this.visible;
	
	this.tinTerrainManager;
	
	this.isAdult = false;
	this.birthTime;
	
	/**
	 * Object's current rendering phase. Parameter to avoid duplicated render on scene.
	 * @type {Boolean}
	 * @default false
	 */
	this.renderingFase = false;
};

TinTerrain.prototype.deleteObjects = function(magoManager)
{
	var gl = magoManager.sceneState.gl;
	
	// delete all tree under this tinTerrain. no delete tiles if depth < 2.
	if (this.childMap !== undefined)
	{
		// subTile 0 (Left-Up).
		var subTile_LU = this.childMap.LU;
		if (subTile_LU !== undefined)
		{
			subTile_LU.deleteObjects(magoManager);
			delete this.childMap.LU;
		}
		
		// subTile 1 (Left-Down).
		var subTile_LD = this.childMap.LD;
		if (subTile_LD !== undefined)
		{
			subTile_LD.deleteObjects(magoManager);
			delete this.childMap.LD;
		}
		
		// subTile 2 (Right-Up).
		var subTile_RU = this.childMap.RU;
		if (subTile_RU !== undefined)
		{
			subTile_RU.deleteObjects(magoManager);
			delete this.childMap.RU;
		}
		
		// subTile 3 (Right-Down).
		var subTile_RD = this.childMap.RD;
		if (subTile_RD !== undefined)
		{
			subTile_RD.deleteObjects(magoManager);
			delete this.childMap.RD;
		}
		
		this.childMap = undefined;
	}
	
	// no delete tiles if depth < 2.
	if (this.depth < 2)
	{ return; }
		
	// now delete objects of this tinTerrain.
	this.owner = undefined;
	this.depth = undefined; 
	this.childArray = undefined;
	this.childMap = undefined; 
	
	// Data.
	this.X = undefined; // index X.
	this.Y = undefined; // index Y.
	
	// Tile extent.
	if (this.geographicExtent !== undefined)
	{
		this.geographicExtent.deleteObjects();
		this.geographicExtent = undefined;
	}
	
	if (this.sphereExtent !== undefined)
	{
		this.sphereExtent.deleteObjects();
		this.sphereExtent = undefined;
	}
	
	// Tile geometry data.
	this.fileLoadState = 0;
	this.dataArrayBuffer = undefined;
	
	if (this.vboKeyContainer !== undefined)
	{
		this.vboKeyContainer.deleteGlObjects(gl, magoManager.vboMemoryManager);
		this.vboKeyContainer = undefined; // class: VBOVertexIdxCacheKeysContainer.
		
	}
	this.terrainPositionHIGH = undefined;
	this.terrainPositionLOW = undefined;
	
	this.indexName = undefined;
	this.pathName = undefined; // example: "14//4567//516".
	
	
	if (this.texture !== undefined)
	{
		var textureKeys = Object.keys(this.texture);
		for (var i=0, len=textureKeys.length;i<len;i++) 
		{
			var texture = this.texture[textureKeys[i]];
			texture.deleteObjects(gl);
			texture = undefined;
		}
		this.texture = {};
	}
	this.visible = undefined;
};

TinTerrain.prototype.getPathName = function()
{
	// this returns a string as: L//X//Y.
	// example: "14//4567//516".
	return this.depth.toString() + "\\" + this.X.toString() + "\\" + this.Y.toString();
};

/**
 * Returns the blending alpha value in current time.
 * 
 * @param {Number} currTime The current time.
 */
TinTerrain.prototype.getBlendAlpha = function(currTime) 
{
	if (!this.isAdult)
	{
		if (this.birthTime === undefined)
		{ this.birthTime = currTime; }
	
		if (this.blendAlpha === undefined)
		{ this.blendAlpha = 0.1; }
		
		var increAlpha = (currTime - this.birthTime)*0.0001;
		this.blendAlpha += increAlpha;
		
		if (this.blendAlpha >= 1.0)
		{
			this.blendAlpha = 1.0;
			this.isAdult = true;
		}
	}
	else
	{ return 1.0; }
	
	return this.blendAlpha;
};

TinTerrain.prototype.setWebMercatorExtent = function(minX, minY, maxX, maxY)
{
	if (this.webMercatorExtent === undefined)
	{ this.webMercatorExtent = new Rectangle2D(); }
	
	this.webMercatorExtent.setExtension(minX, minY, maxX, maxY);
	// Note: the minX & maxX are no util values.
};

TinTerrain.prototype.setGeographicExtent = function(minLon, minLat, minAlt, maxLon, maxLat, maxAlt)
{
	if (this.geographicExtent === undefined)
	{ this.geographicExtent = new GeographicExtent(); }
	
	var geoExtent = this.geographicExtent;
	
	if (geoExtent.minGeographicCoord === undefined)
	{ geoExtent.minGeographicCoord = new GeographicCoord(); }
	
	if (geoExtent.maxGeographicCoord === undefined)
	{ geoExtent.maxGeographicCoord = new GeographicCoord(); }
	
	geoExtent.minGeographicCoord.setLonLatAlt(minLon, minLat, minAlt);
	geoExtent.maxGeographicCoord.setLonLatAlt(maxLon, maxLat, maxAlt);
};

TinTerrain.prototype.isChildrenPrepared = function()
{
	if (this.childMap === undefined)
	{ return false; }
	
	if (this.childMap.length < 4)
	{ return false; }
	
	if (this.childMap.LU.isPrepared() && this.childMap.LD.isPrepared() && this.childMap.RU.isPrepared() &&  this.childMap.RD.isPrepared())
	{ return true; }
	else
	{ return false; }
};

TinTerrain.prototype.isTexturePrepared = function()
{
	var isTexturePrepared = true;
	var textureKeys = Object.keys(this.texture);
	var textureLength = textureKeys.length;
	if (textureLength === 0) 
	{
		return false;
	}
	for (var i=0;i<textureLength;i++) 
	{
		var texture = this.texture[textureKeys[i]];
		if (texture.fileLoadState !== CODE.fileLoadState.LOADING_FINISHED || !texture.texId) 
		{
			isTexturePrepared = false;
			break;
		}
	}
	return isTexturePrepared;
};
TinTerrain.prototype.isPrepared = function()
{
	// a tinTerrain is prepared if this is parsed and vbo maked and texture binded.
	if (this.fileLoadState !== CODE.fileLoadState.PARSE_FINISHED)
	{ return false; }
	
	
	if (!this.isTexturePrepared()) { return false; }
	
	if (this.vboKeyContainer === undefined || 
		this.vboKeyContainer.vboCacheKeysArray === undefined || 
		this.vboKeyContainer.vboCacheKeysArray.length === 0)
	{ return false; }
	
	return true;
};

TinTerrain.prototype.prepareTexture = function(magoManager, tinTerrainManager)
{
	var gl = magoManager.sceneState.gl;

	var L = this.depth.toString();
	var X = this.X.toString();
	var Y = this.Y.toString();

	var imagerys = tinTerrainManager.imagerys;

	for (var i=0, len=imagerys.length;i<len;i++) 
	{
		var imagery = imagerys[i];
		if (imagery.maxZoom < parseInt(L) || imagery.minZoom > parseInt(L)) { continue; }
		if (this.texture[imagery._id]) { continue; }

		var texture = new Texture();
		var textureUrl = imagery.getUrl({x: X, y: Y, z: L});

		this.texFilePath__TEST = textureUrl;
		var flip_y_texCoords = false;
		magoManager.readerWriter.loadWMSImage(gl, textureUrl, texture, magoManager, flip_y_texCoords);
		this.texture[imagery._id] = texture;
	}
		
	//var textureFilePath = "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/" + L + "/" + Y + "/" + X;
	//var textureFilePath = "https://services.arcgisonline.com/arcgis/rest/services/World_Street_Map/MapServer/tile/" + L + "/" + Y + "/" + X + ".png";
	//var textureFilePath = "https://services.arcgisonline.com/arcgis/rest/services/World_Physical_Map/MapServer/tile/" + L + "/" + Y + "/" + X + ".png"; // low res.
	//var textureFilePath = "https://services.arcgisonline.com/arcgis/rest/services/NatGeo_World_Map/MapServer/tile/" + L + "/" + Y + "/" + X + ".png"; // low res.
	//var textureFilePath = "https://c.tile.openstreetmap.org/" + L + "/" + X + "/" + Y + ".png";
	
	// Provisionally, for debug, save textureFilePath.***
	//this.texFilePath__TEST = textureFilePath;
	//var flip_y_texCoords = false;
	//magoManager.readerWriter.loadWMSImage(gl, textureFilePath, this.texture, magoManager, flip_y_texCoords);
};

TinTerrain.prototype.prepareTinTerrainPlain = function(magoManager, tinTerrainManager)
{
	// Earth considering as an ellipsoid (no elevation data of terrain).***
	// This is a test function.!!!
	// This function 1- loads file & 2- parses file & 3- makes vbo.
	// 1rst, check if the parent is prepared. If parent is not prepared, then prepare the parent.
	
	if (this.owner === undefined || this.owner.isPrepared())
	{
		// 1rst, try to erase from procesQueue_deleting if exist.
		magoManager.processQueue.eraseTinTerrainToDelete(this);
		
		// Prepare this tinTerrain.
		this.fileLoadState = CODE.fileLoadState.PARSE_FINISHED; // Test code.!!!
		if (this.fileLoadState === CODE.fileLoadState.READY)
		{
			//var pathName = this.getPathName();
			//var fileName = "Terrain/" + pathName + ".terrain";
			//magoManager.readerWriter.loadTINTerrain(fileName, this, magoManager);
			
		}
		else if (this.fileLoadState === CODE.fileLoadState.LOADING_FINISHED)
		{
			// put the terrain into parseQueue.
			//magoManager.parseQueue.putTinTerrainToParse(this, 0);
		}
		else if (this.fileLoadState === CODE.fileLoadState.PARSE_FINISHED && this.vboKeyContainer === undefined)
		{
			this.calculateCenterPosition();
			this.makeMeshVirtually(20, 20, undefined, undefined);
			this.makeVbo(magoManager.vboMemoryManager);
		}
		else if (!this.isTexturePrepared())
		{
			//if (magoManager.fileRequestControler.tinTerrainTexturesRequested < 2)
			{
				this.prepareTexture(magoManager, tinTerrainManager);
			}
		}

		return;
	}
	else
	{
		// Prepare ownerTinTerrain.
		this.owner.prepareTinTerrainPlain(magoManager, tinTerrainManager);
		return;
	}
};

TinTerrain.prototype.prepareTinTerrain = function(magoManager, tinTerrainManager)
{
	// This function 1- loads file & 2- parses file & 3- makes vbo.
	// 1rst, check if the parent is prepared. If parent is not prepared, then prepare the parent.
	if (this.owner === undefined || this.owner.isPrepared())
	{
		// 1rst, try to erase from procesQueue_deleting if exist.
		magoManager.processQueue.eraseTinTerrainToDelete(this);
		
		// Prepare this tinTerrain.
		if (this.fileLoadState === CODE.fileLoadState.READY)
		{
			//if (magoManager.fileRequestControler.tinTerrainFilesRequested < 2)
			{
				var pathName = this.getPathName();
				var geometryDataPath = magoManager.readerWriter.geometryDataPath;
				var fileName = geometryDataPath + "/Terrain/" + pathName + ".terrain";
				magoManager.readerWriter.loadTINTerrain(fileName, this, magoManager);
			}
			
		}
		else if (this.fileLoadState === CODE.fileLoadState.LOADING_FINISHED)
		{
			// put the terrain into parseQueue.
			magoManager.parseQueue.putTinTerrainToParse(this, 0);
		}
		else if (this.fileLoadState === CODE.fileLoadState.PARSE_FINISHED && this.vboKeyContainer === undefined)
		{
			this.decodeData(tinTerrainManager.imageryType);
			this.makeVbo(magoManager.vboMemoryManager);
		}
		else if (!this.isTexturePrepared())
		{
			//if (magoManager.fileRequestControler.tinTerrainTexturesRequested < 2)
			{
				this.prepareTexture(magoManager, tinTerrainManager);
			}
		}
		else if (this.fileLoadState === CODE.fileLoadState.LOAD_FAILED)
		{
			// Test.***
			this.prepareTinTerrainPlain(magoManager, tinTerrainManager);
			// End test.---
		}

		return;
	}
	else
	{
		// Prepare ownerTinTerrain.
		this.owner.prepareTinTerrain(magoManager, tinTerrainManager);
		return;
	}
};

TinTerrain.prototype.hasChildren = function()
{
	if (this.childMap !== undefined && this.childMap.length > 0)
	{ return true; }
	
	return false;
};

TinTerrain.prototype.deleteTinTerrain = function(magoManager)
{
	// The quadTree must be deleted lowest-quads first.
	// Check if this has child. If this has child, then, 1rst delete child.
	if (this.hasChildren())
	{
		// Delete children 1rst.
		for (var key in this.childMap)
		{
			if (Object.prototype.hasOwnProperty.call(this.childMap, key))
			{
				var child = this.childMap[key];
				child.deleteTinTerrain(magoManager);
			}
		}
		
		return false;
	}
	else
	{
		// 1rst, delete from parse-queue if exist.
		magoManager.parseQueue.eraseTinTerrainToParse(this);
		// put this tinTerrain into deleteQueue.
		magoManager.processQueue.putTinTerrainToDelete(this, 0);
		
		// now, must erase from myOwner-childrenMap.
		delete this.owner.childMap[this.indexName];
		
		if (this.owner.childMap.length === 0)
		{ this.owner.childMap = undefined; }
		
		return true;
	}
};

TinTerrain.prototype.renderBorder = function(currentShader, magoManager)
{
	// TODO:
};

TinTerrain.prototype.render = function(currentShader, magoManager, bDepth, renderType)
{	
	if (this.depth === 0)
	{ return true; }
	
	if (this.owner === undefined || (this.owner.isPrepared() && this.owner.isChildrenPrepared()))
	{
		if (this.isPrepared())
		{
			if (this.fileLoadState === CODE.fileLoadState.LOAD_FAILED) // provisional solution.
			{ return false; }
		
			if (!this.isTexturePrepared())
			{ return false; }
		
			var gl = magoManager.getGl();
			if (renderType === 2)
			{
				var colorAux;
				colorAux = magoManager.selectionColor.getAvailableColor(colorAux);
				var idxKey = magoManager.selectionColor.decodeColor3(colorAux.r, colorAux.g, colorAux.b);
				magoManager.selectionManager.setCandidateGeneral(idxKey, this);
				
				gl.uniform1i(currentShader.colorType_loc, 0); // 0= oneColor, 1= attribColor, 2= texture.
				gl.uniform4fv(currentShader.oneColor4_loc, [colorAux.r/255.0, colorAux.g/255.0, colorAux.b/255.0, 1.0]);
			}
			else if (renderType === 1)
			{
				var activeTexturesLayers = new Int32Array([1, 1, 0, 0, 0, 0, 0, 0]);
				gl.uniform1i(currentShader.colorType_loc, 2); // 0= oneColor, 1= attribColor, 2= texture.
				gl.uniform1f(currentShader.externalAlpha_loc, 1);

				var textureKeys = Object.keys(this.texture);
				var textureLength = textureKeys.length; 
				for (var i=0;i<textureLength;i++) 
				{
					gl.activeTexture(gl.TEXTURE2 + i); 
					var texture = this.texture[textureKeys[i]];
					gl.bindTexture(gl.TEXTURE_2D, texture.texId);
					
					activeTexturesLayers[2+i] = 1;
				}	

				gl.uniform1iv(currentShader.uActiveTextures_loc, activeTexturesLayers);
			}

			// render this tinTerrain.
			var renderWireframe = false;
			var vboMemManager = magoManager.vboMemoryManager;
			
			gl.uniform3fv(currentShader.buildingPosHIGH_loc, this.terrainPositionHIGH);
			gl.uniform3fv(currentShader.buildingPosLOW_loc, this.terrainPositionLOW);
			
			var vboKey = this.vboKeyContainer.vboCacheKeysArray[0]; // the idx = 0 is the terrain. idx = 1 is the skirt.
			
			// Positions.
			if (!vboKey.bindDataPosition(currentShader, vboMemManager))
			{ 
				if (this.owner !== undefined)
				{ this.owner.render(currentShader, magoManager, bDepth, renderType); }
				return false; 
			}
		
			// TexCoords (No necessary for depth rendering).
			if (!bDepth)
			{
				if (!vboKey.bindDataTexCoord(currentShader, vboMemManager))
				{
					if (this.owner !== undefined)
					{ this.owner.render(currentShader, magoManager, bDepth, renderType); }					
					return false; 
				}
			}
			
			// Normals.
			if (!vboKey.bindDataNormal(currentShader, vboMemManager))
			{ 
				if (this.owner !== undefined)
				{ this.owner.render(currentShader, magoManager, bDepth, renderType); }
				return false; 
			}
			
			// Colors.
			// todo:
			
			// shader.altitude_loc
			if (vboKey.bindDataCustom(currentShader, vboMemManager, "altitudes"))
			{
				gl.uniform1i(currentShader.bExistAltitudes_loc, true);
			}
			else 
			{
				gl.uniform1i(currentShader.bExistAltitudes_loc, false);
			}
			
			
			// Indices.
			if (!vboKey.bindDataIndice(currentShader, vboMemManager))
			{ 
				if (this.owner !== undefined)
				{ this.owner.render(currentShader, magoManager, bDepth, renderType); }
				return false; 
			}
			
			var indicesCount = vboKey.indicesCount;
			
			if (renderWireframe)
			{
				var trianglesCount = indicesCount;
				for (var i=0; i<trianglesCount; i++)
				{
					gl.drawElements(gl.LINE_LOOP, 3, gl.UNSIGNED_SHORT, i*3); // Fill.
				}
			}
			else
			{
				gl.drawElements(gl.TRIANGLES, indicesCount, gl.UNSIGNED_SHORT, 0); // Fill.
			}
			
			// Test Render wireframe if selected.*************************************************************
			if (renderType === 1)
			{
				gl.uniform1i(currentShader.colorType_loc, 2); // 0= oneColor, 1= attribColor, 2= texture.
				var currSelObject = magoManager.selectionManager.getSelectedGeneral();
				if (currSelObject === this)
				{
					gl.uniform1i(currentShader.colorType_loc, 0); // 0= oneColor, 1= attribColor, 2= texture.
					gl.uniform4fv(currentShader.oneColor4_loc, [0.0, 0.9, 0.9, 1.0]);
					
					gl.drawElements(gl.LINES, indicesCount-1, gl.UNSIGNED_SHORT, 0); 
					/*
					if (this.tinTerrainManager.getTerrainType() === 0)
					{
						gl.drawElements(gl.LINE_STRIP, indicesCount-1, gl.UNSIGNED_SHORT, 0); 
					}
					else 
					{
						var trianglesCount = indicesCount;
						for (var i=0; i<trianglesCount-1; i++)
						{
							gl.drawElements(gl.LINE_LOOP, 3, gl.UNSIGNED_SHORT, i*3); 
						}
					}
					*/
					this.drawTerrainName(magoManager);
				}
			}
			// End test.--------------------------------------------------------------------------------------
			
			// Render skirt if exist.
			var vboKey = this.vboKeyContainer.vboCacheKeysArray[1]; // the idx = 0 is the terrain. idx = 1 is the skirt.
			if (vboKey === undefined)
			{ return; }
			
			// Positions.
			if (!vboKey.bindDataPosition(currentShader, magoManager.vboMemoryManager))
			{ 
				return false; 
			}
		
			// TexCoords (No necessary for depth rendering).
			if (!bDepth)
			{
				if (!vboKey.bindDataTexCoord(currentShader, magoManager.vboMemoryManager))
				{				
					return false; 
				}
			}
			
			if (vboKey.bindDataCustom(currentShader, vboMemManager, "altitudes"))
			{
				gl.uniform1i(currentShader.bExistAltitudes_loc, true);
			}
			else 
			{
				gl.uniform1i(currentShader.bExistAltitudes_loc, false);
			}
			
			// Normals.
			// todo:
			
			// Colors.
			// todo:
			
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, vboKey.vertexCount); // Fill.

		}
		else 
		{
			// render the owner tinTerrain.
			if (this.owner !== undefined)
			{ this.owner.render(currentShader, magoManager, bDepth, renderType); }
		}
	}
	else 
	{
		// render the owner tinTerrain.
		if (this.owner !== undefined)
		{ this.owner.render(currentShader, magoManager, bDepth, renderType); }
	}
	
	return true;
};

/**
 * Draw terrain names on scene.
 */
TinTerrain.prototype.drawTerrainName = function(magoManager) 
{
	var canvas = magoManager.getObjectLabel();
	var ctx = canvas.getContext("2d");

	var gl = magoManager.getGl();
	var screenCoord;
	
	// Calculate the middle geoLocation.
	var midGeoCoord = this.geographicExtent.getMidPoint();
	var pointWC = ManagerUtils.geographicCoordToWorldPoint(midGeoCoord.longitude, midGeoCoord.latitude, midGeoCoord.altitude, undefined);
	screenCoord = ManagerUtils.calculateWorldPositionToScreenCoord(gl, pointWC.x, pointWC.y, pointWC.z, screenCoord, magoManager);
	
	if (screenCoord.x >= 0 && screenCoord.y >= 0)
	{
		ctx.font = "13px Arial";
		var pathName = this.getPathName();
		ctx.strokeText(pathName, screenCoord.x, screenCoord.y);
		ctx.fillText(pathName, screenCoord.x, screenCoord.y);
		
		magoManager.canvasDirty = true;
	}
	
	ctx.restore(); 
};

TinTerrain.prototype.extractLowestTinTerrains = function(resultLowestTilesArray)
{
	if (hasChildren())
	{
		for (var key in this.childMap)
		{
			if (Object.prototype.hasOwnProperty.call(this.childMap, key))
			{
				var child = this.childMap[key];
				child.visible = false;
				//child.extractLowestTinTerrains(resultLowestTilesArray);
				resultLowestTilesArray.push(child);
			}
		}
	}
	else 
	{
		//resultLowestTilesArray.push(this);
	}
};

TinTerrain.prototype.getFrustumIntersectedTinTerrainsQuadTree = function(frustum, maxDepth, camPos, magoManager, visibleTilesArray, noVisibleTilesArray)
{
	// Note: this is NO frustum intersection. Select tiles by distance to camera. Function name must to be change.
	if (this.geographicExtent === undefined || this.geographicExtent.minGeographicCoord === undefined || this.geographicExtent.maxGeographicCoord === undefined)
	{ return; }
	
	var currMinGeographicCoords = this.geographicExtent.minGeographicCoord;
	var currMaxGeographicCoords = this.geographicExtent.maxGeographicCoord;
		
	if (this.sphereExtent === undefined)
	{
		this.sphereExtent = SmartTile.computeSphereExtent(magoManager, currMinGeographicCoords, currMaxGeographicCoords, this.sphereExtent);
	}
	
	var sphereExtentAux = this.sphereExtent;

	var currDepth = this.depth;
	
	// check distance to camera.
	this.distToCam = camPos.distToSphere(sphereExtentAux);
	var distLimit = this.tinTerrainManager.distLimitByDepth[currDepth];
	
	if (this.distToCam > distLimit)
	{
		// finish the process.
		this.visible = true;
		visibleTilesArray.push(this);
		
		// Now, extract all lowest-child and put into "noVisibleTilesArray".***
		if (this.hasChildren())
		{
			//this.extractLowestTinTerrains(noVisibleTilesArray);
			noVisibleTilesArray.push(this.childMap.LU);
			noVisibleTilesArray.push(this.childMap.LD);
			noVisibleTilesArray.push(this.childMap.RU);
			noVisibleTilesArray.push(this.childMap.RD);
		}
		return;
	}
	
	if (currDepth < maxDepth)
	{
		// must descend.
		var curX = this.X;
		var curY = this.Y;
		var minLon = currMinGeographicCoords.longitude;
		var minLat = currMinGeographicCoords.latitude;
		var minAlt = currMinGeographicCoords.altitude;
		var maxLon = currMaxGeographicCoords.longitude;
		var maxLat = currMaxGeographicCoords.latitude;
		var maxAlt = currMaxGeographicCoords.altitude;
		var midLon = (minLon + maxLon)/ 2;
		var midLat = (minLat + maxLat)/ 2;
	
		// create children if no exist.
		// +--------------+--------------+
		// | subTile 0(LU)| subTile 2(RU)|
		// | X = curX*2   | X = curX*2+1 |
		// | Y = curY*2   | Y = curY*2   |
		// |              |              |
		// +--------------+--------------+
		// | subTile 1(LD)| subTile 3(RD)|
		// | X = curX*2   | X = curX*2+1 |
		// | Y = curY*2+1 | Y = curY*2+1 |
		// |              |              |
		// +--------------+--------------+
		
		if (this.tinTerrainManager.imageryType === CODE.imageryType.WEB_MERCATOR)
		{
			midLat = this.getMidLatitudeRadWebMercator()*180/Math.PI;
		}
		
		var wmMinX = this.webMercatorExtent.minX;
		var wmMinY = this.webMercatorExtent.minY;
		var wmMaxX = this.webMercatorExtent.maxX;
		var wmMaxY = this.webMercatorExtent.maxY;
		var wmMidX = (wmMaxX + wmMinX)/2.0;
		var wmMidY = (wmMaxY + wmMinY)/2.0;
			
		if (this.childMap === undefined)
		{ this.childMap = {}; }
		
		// subTile 0 (Left-Up).
		var subTile_LU = this.childMap.LU;
		if (subTile_LU === undefined)
		{
			// if no exist -> create it.
			subTile_LU = new TinTerrain(this);
			subTile_LU.X = curX*2;
			subTile_LU.Y = curY*2;
			subTile_LU.setGeographicExtent(minLon, midLat, minAlt,  midLon, maxLat, maxAlt); 
			subTile_LU.indexName = "LU";
			subTile_LU.tinTerrainManager = this.tinTerrainManager;
			this.childMap.LU = subTile_LU;
			
			subTile_LU.setWebMercatorExtent(wmMinX, wmMidY, wmMidX, wmMaxY);
		}
		
		// subTile 1 (Left-Down).
		var subTile_LD = this.childMap.LD;
		if (subTile_LD === undefined)
		{
			// if no exist -> create it.
			subTile_LD = new TinTerrain(this);
			subTile_LD.X = curX*2;
			subTile_LD.Y = curY*2+1;
			subTile_LD.setGeographicExtent(minLon, minLat, minAlt,  midLon, midLat, maxAlt); 
			subTile_LD.indexName = "LD";
			subTile_LD.tinTerrainManager = this.tinTerrainManager;
			this.childMap.LD = subTile_LD;
			
			subTile_LD.setWebMercatorExtent(wmMinX, wmMinY, wmMidX, wmMidY);
		}
		
		// subTile 2 (Right-Up).
		var subTile_RU = this.childMap.RU;
		if (subTile_RU === undefined)
		{
			subTile_RU = new TinTerrain(this);
			subTile_RU.X = curX*2+1;
			subTile_RU.Y = curY*2;
			subTile_RU.setGeographicExtent(midLon, midLat, minAlt,  maxLon, maxLat, maxAlt); 
			subTile_RU.indexName = "RU";
			subTile_RU.tinTerrainManager = this.tinTerrainManager;
			this.childMap.RU = subTile_RU;
			
			subTile_RU.setWebMercatorExtent(wmMidX, wmMidY, wmMaxX, wmMaxY);
		}
		
		// subTile 3 (Right-Down).
		var subTile_RD = this.childMap.RD;
		if (subTile_RD === undefined)
		{
			subTile_RD = new TinTerrain(this);
			subTile_RD.X = curX*2+1;
			subTile_RD.Y = curY*2+1;
			subTile_RD.setGeographicExtent(midLon, minLat, minAlt,  maxLon, midLat, maxAlt);
			subTile_RD.indexName = "RD";
			subTile_RD.tinTerrainManager = this.tinTerrainManager;
			this.childMap.RD = subTile_RD;
			
			subTile_RD.setWebMercatorExtent(wmMidX, wmMinY, wmMaxX, wmMidY);
		}
		
		// now, do frustumCulling for each childTiles.
		subTile_LU.getFrustumIntersectedTinTerrainsQuadTree(frustum, maxDepth, camPos, magoManager, visibleTilesArray, noVisibleTilesArray);
		subTile_LD.getFrustumIntersectedTinTerrainsQuadTree(frustum, maxDepth, camPos, magoManager, visibleTilesArray, noVisibleTilesArray);
		subTile_RU.getFrustumIntersectedTinTerrainsQuadTree(frustum, maxDepth, camPos, magoManager, visibleTilesArray, noVisibleTilesArray);
		subTile_RD.getFrustumIntersectedTinTerrainsQuadTree(frustum, maxDepth, camPos, magoManager, visibleTilesArray, noVisibleTilesArray);
	}
	else 
	{
		// finish the process.
		this.visible = true;
		visibleTilesArray.push(this);
		return;
	}
	
};

TinTerrain.prototype.calculateCenterPosition = function()
{
	// Note: The centerPosition is Float64Array type.
	// The centerPosition of tiles are calculate with "altitude" = 0;.
	// Note: if the earth is made in only 1 tile, then this calculations is bad.
	if (this.depth === 0)
	{
		this.centerX = new Float64Array([0]);
		this.centerY = new Float64Array([0]);
		this.centerZ = new Float64Array([0]);
	}
	else
	{
		var altitude = 0.0;
		var resultGeographicCoord;
		resultGeographicCoord = this.geographicExtent.getMidPoint(resultGeographicCoord);
		
		var centerLon = resultGeographicCoord.longitude;
		var centerLat = resultGeographicCoord.latitude;
		
		var resultCartesian;
		resultCartesian = Globe.geographicToCartesianWgs84(centerLon, centerLat, altitude, resultCartesian);
		
		// Float64Array.
		this.centerX = new Float64Array([resultCartesian[0]]);
		this.centerY = new Float64Array([resultCartesian[1]]);
		this.centerZ = new Float64Array([resultCartesian[2]]);
		
		
	}
	
};

TinTerrain.prototype.getMidLatitudeRadWebMercator = function()
{
	if (this.webMercatorExtent === undefined)
	{ return undefined; }
	
	
	var midMercatorY = (this.webMercatorExtent.maxY + this.webMercatorExtent.minY)/2.0;
	var latRad = 2*Math.atan(Math.pow(Math.E, midMercatorY)) - Math.PI/2;
	
	
	if (isNaN(latRad))
	{ var hola = 0; }
	return latRad;
};

TinTerrain.prototype.makeMeshVirtually = function(lonSegments, latSegments, altitude, altitudesSlice)
{
	// WEB_MERCATOR.
	// This function makes an ellipsoidal mesh for tiles that has no elevation data.
	// note: "altitude" & "altitudesSlice" are optionals.
	var degToRadFactor = Math.PI/180.0;
	var minLon = this.geographicExtent.minGeographicCoord.longitude * degToRadFactor;
	var minLat = this.geographicExtent.minGeographicCoord.latitude * degToRadFactor;
	var maxLon = this.geographicExtent.maxGeographicCoord.longitude * degToRadFactor;
	var maxLat = this.geographicExtent.maxGeographicCoord.latitude * degToRadFactor;
	
	// Test.*******************************************************************************
	//var minLon = -60 * degToRadFactor;
	//var minLat = -45 * degToRadFactor;
	//var maxLon = -45 * degToRadFactor;
	//var maxLat = -20 * degToRadFactor;
	// End test.----------------------------------------------------------------------------
	
	var lonRange = maxLon - minLon;
	var latRange = maxLat - minLat;
	var depth = this.depth;
	
	var lonIncreDeg = lonRange/lonSegments;
	var latIncreDeg = latRange/latSegments;
	
	// calculate total verticesCount.
	var vertexCount = (lonSegments + 1)*(latSegments + 1);
	var lonArray = new Float32Array(vertexCount);
	var latArray = new Float32Array(vertexCount);
	var altArray = new Float32Array(vertexCount);
	this.texCoordsArray = new Float32Array(vertexCount*2);
	
	var currLon = minLon; // init startLon.
	var currLat = minLat; // init startLat.
	var idx = 0;
	var s, t;

	var PI = Math.PI;
	var aConst = (1.0/(2.0*PI))*Math.pow(2.0, depth);
	
	// check if exist altitude.
	var alt = 0;
	if (altitude)
	{ alt = altitude; }
	
	// https://en.wikipedia.org/wiki/Web_Mercator_projection
	var PI_DIV_4 = PI/4;
	var minT = aConst*(PI-Math.log(Math.tan(PI_DIV_4+minLat/2)));
	var maxT = aConst*(PI-Math.log(Math.tan(PI_DIV_4+maxLat/2)));
	var minS = aConst*(minLon+PI);
	var maxS = aConst*(maxLon+PI);
	var floorMinS = Math.floor(minS);
	
	// Flip texCoordY for minT & maxT.***
	minT = 1.0 - minT;
	maxT = 1.0 - maxT;
	
	//var texCorrectionFactor = 0.0005;
	var texCorrectionFactor = 0.003 + (depth * 0.0000001);
	//var texCorrectionFactor = 0.002 + (1/(depth+1) * 0.008);
	
	for (var currLatSeg = 0; currLatSeg<latSegments+1; currLatSeg++)
	{
		currLat = minLat + latIncreDeg * currLatSeg;
		if (currLat > maxLat)
		{ currLat = maxLat; }
	
		t = aConst*(PI-Math.log(Math.tan(PI_DIV_4+currLat/2)));
		t = 1.0 - t;
			
		// Substract minT to "t" to make range [0 to 1].***
		t -= minT; 
		
		// Texture correction in borders.***
		if (currLatSeg === 0)
		{
			t = (texCorrectionFactor);
		}
		else if (currLatSeg === latSegments)
		{
			t = (1-texCorrectionFactor);
		}
		
		for (var currLonSeg = 0; currLonSeg<lonSegments+1; currLonSeg++)
		{
			currLon = minLon + lonIncreDeg * currLonSeg;
			
			if (currLon > maxLon)
			{ currLon = maxLon; }
			
			lonArray[idx] = currLon;
			latArray[idx] = currLat;
			// Now set the altitude.
			if (altitudesSlice)
			{
				altArray[idx] = altitudesSlice.getValue(currLonSeg, currLatSeg);
			}
			else
			{ altArray[idx] = alt; }

			s = aConst*(currLon+PI);
			s -= floorMinS;
			
			// Texture correction in borders.***
			if (currLonSeg === 0)
			{
				s += texCorrectionFactor/2;
			}
			else if (currLonSeg === lonSegments)
			{
				s += -texCorrectionFactor/2;
			}
			
			this.texCoordsArray[idx*2] = s;
			this.texCoordsArray[idx*2+1] = t;
			
			// actualize current values.
			idx++;
		}
	}
	
	this.cartesiansArray = Globe.geographicRadianArrayToFloat32ArrayWgs84(lonArray, latArray, altArray, this.cartesiansArray);
	
	
	// test code.**************************************
	/*
	var pointArrayAux = [];
	var radToDegFactor = 180.0/Math.PI;
	var coordsCount = this.cartesiansArray.length/3;
	for (var i=0; i<coordsCount; i++)
	{
		var x = this.cartesiansArray[i*3];
		var y = this.cartesiansArray[i*3+1];
		var z = this.cartesiansArray[i*3+2];
		
		var pointAux = new Point3D(x, y, z);
		pointArrayAux.push(pointAux);
		
	}
	*/
	// end test code.----------------------------------
	
	
	// Make normals using the cartesians.***
	this.normalsArray = new Int8Array(vertexCount*3);
	var point = new Point3D();
	for (var i=0; i<vertexCount; i++)
	{
		point.set(this.cartesiansArray[i*3], this.cartesiansArray[i*3+1], this.cartesiansArray[i*3+2]);
		point.unitary();
		
		this.normalsArray[i*3] = point.x*126;
		this.normalsArray[i*3+1] = point.y*126;
		this.normalsArray[i*3+2] = point.z*126;
	}
	
	// finally make indicesArray.
	var numCols = lonSegments + 1;
	var numRows = latSegments + 1;
	var options = {
		bCalculateBorderIndices: true
	};
	
	
	var resultObject = GeometryUtils.getIndicesTrianglesRegularNet(numCols, numRows, undefined, undefined, undefined, undefined, undefined, options);
	this.indices = resultObject.indicesArray;
	this.southIndices = resultObject.southIndicesArray;
	this.eastIndices = resultObject.eastIndicesArray;
	this.northIndices = resultObject.northIndicesArray;
	this.westIndices = resultObject.westIndicesArray;
	
	this.westVertexCount = this.westIndices.length;
	this.southVertexCount = this.southIndices.length;
	this.eastVertexCount = this.eastIndices.length;
	this.northVertexCount = this.northIndices.length;
	
	// make skirtMesh data.
	var options = {
		skirtDepth          : 50000,
		texCorrectionFactor : texCorrectionFactor
	};
	
	if (this.depth === 6)
	{ var hola = 0; }
	
	var skirtResultObject = TinTerrain.getSkirtTrianglesStrip(lonArray, latArray, altArray, this.texCoordsArray, this.southIndices, this.eastIndices, this.northIndices, this.westIndices, options);
	this.skirtCartesiansArray = skirtResultObject.skirtCartesiansArray;
	this.skirtTexCoordsArray = skirtResultObject.skirtTexCoordsArray;
	
	this.calculateCenterPosition();
};

TinTerrain.prototype.makeMeshVirtuallyCRS84 = function(lonSegments, latSegments, altitude, altitudesSlice)
{
	// This function makes an ellipsoidal mesh for tiles that has no elevation data.
	// note: "altitude" & "altitudesSlice" are optionals.
	var degToRadFactor = Math.PI/180.0;
	var minLon = this.geographicExtent.minGeographicCoord.longitude * degToRadFactor;
	var minLat = this.geographicExtent.minGeographicCoord.latitude * degToRadFactor;
	var maxLon = this.geographicExtent.maxGeographicCoord.longitude * degToRadFactor;
	var maxLat = this.geographicExtent.maxGeographicCoord.latitude * degToRadFactor;
	var lonRange = maxLon - minLon;
	var latRange = maxLat - minLat;
	var depth = this.depth;
	
	var lonIncreDeg = lonRange/lonSegments;
	var latIncreDeg = latRange/latSegments;
	
	// calculate total verticesCount.
	var vertexCount = (lonSegments + 1)*(latSegments + 1);
	var lonArray = new Float32Array(vertexCount);
	var latArray = new Float32Array(vertexCount);
	var altArray = new Float32Array(vertexCount);
	this.texCoordsArray = new Float32Array(vertexCount*2);
	
	var currLon = minLon; // init startLon.
	var currLat = minLat; // init startLat.
	var idx = 0;
	var s, t;

	
	// check if exist altitude.
	var alt = 0;
	if (altitude)
	{ alt = altitude; }
	
	for (var currLatSeg = 0; currLatSeg<latSegments+1; currLatSeg++)
	{
		currLat = minLat + latIncreDeg * currLatSeg;
		if (currLat > maxLat)
		{ currLat = maxLat; }
		
		
		for (var currLonSeg = 0; currLonSeg<lonSegments+1; currLonSeg++)
		{
			currLon = minLon + lonIncreDeg * currLonSeg;
			
			if (currLon > maxLon)
			{ currLon = maxLon; }
			
			lonArray[idx] = currLon;
			latArray[idx] = currLat;
			// Now set the altitude.
			if (altitudesSlice)
			{
				altArray[idx] = altitudesSlice.getValue(currLonSeg, currLatSeg);
			}
			else
			{ altArray[idx] = alt; }


			// make texcoords CRS84.***
			s = (currLon - minLon)/lonRange;
			t = (currLat - minLat)/latRange;
			
			this.texCoordsArray[idx*2] = s;
			this.texCoordsArray[idx*2+1] = t;
			
			// actualize current values.
			idx++;
		}
	}
	
	this.cartesiansArray = Globe.geographicRadianArrayToFloat32ArrayWgs84(lonArray, latArray, altArray, this.cartesiansArray);
	
	// Make normals using the cartesians.***
	this.normalsArray = new Int8Array(vertexCount*3);
	var point = new Point3D();
	for (var i=0; i<vertexCount; i++)
	{
		point.set(this.cartesiansArray[i*3], this.cartesiansArray[i*3+1], this.cartesiansArray[i*3+2]);
		point.unitary();
		
		this.normalsArray[i*3] = point.x*126;
		this.normalsArray[i*3+1] = point.y*126;
		this.normalsArray[i*3+2] = point.z*126;
	}
	
	// finally make indicesArray.
	var numCols = lonSegments + 1;
	var numRows = latSegments + 1;
	var options = {
		bCalculateBorderIndices: true
	};
	var resultObject = GeometryUtils.getIndicesTrianglesRegularNet(numCols, numRows, undefined, undefined, undefined, undefined, undefined, options);
	this.indices = resultObject.indicesArray;
	this.southIndices = resultObject.southIndicesArray;
	this.eastIndices = resultObject.eastIndicesArray;
	this.northIndices = resultObject.northIndicesArray;
	this.westIndices = resultObject.westIndicesArray;
	
	this.westVertexCount = this.westIndices.length;
	this.southVertexCount = this.southIndices.length;
	this.eastVertexCount = this.eastIndices.length;
	this.northVertexCount = this.northIndices.length;
	
	this.calculateCenterPosition();
};

TinTerrain.prototype.zigZagDecode = function(value)
{
	return (value >> 1) ^ (-(value & 1));
};

TinTerrain.prototype.makeVbo = function(vboMemManager)
{
	if (this.cartesiansArray === undefined)
	{ return; }

	// rest the CenterPosition to the this.cartesiansArray.
	var coordsCount = this.cartesiansArray.length/3;
	for (var i=0; i<coordsCount; i++)
	{
		this.cartesiansArray[i*3] -= this.centerX[0];
		this.cartesiansArray[i*3+1] -= this.centerY[0];
		this.cartesiansArray[i*3+2] -= this.centerZ[0];
	}
	
	if (this.terrainPositionHIGH === undefined)
	{ this.terrainPositionHIGH = new Float32Array(3); }

	if (this.terrainPositionLOW === undefined)
	{ this.terrainPositionLOW = new Float32Array(3); }
	ManagerUtils.calculateSplited3fv([this.centerX[0], this.centerY[0], this.centerZ[0]], this.terrainPositionHIGH, this.terrainPositionLOW);
	
	if (this.vboKeyContainer === undefined)
	{ this.vboKeyContainer = new VBOVertexIdxCacheKeysContainer(); }
	
	var vboKey = this.vboKeyContainer.newVBOVertexIdxCacheKey();
	
	// Positions.
	vboKey.setDataArrayPos(this.cartesiansArray, vboMemManager);

	
	// Normals.
	if (this.normalsArray)
	{
		vboKey.setDataArrayNor(this.normalsArray, vboMemManager);
	}
	
	// TexCoords.
	if (this.texCoordsArray)
	{
		vboKey.setDataArrayTexCoord(this.texCoordsArray, vboMemManager);
	}
		
	// Indices.
	vboKey.setDataArrayIdx(this.indices, vboMemManager);
	
	// Aditional data.
	// Altitudes.
	if (this.altArray !== undefined)
	{
		var dimensions = 1;
		var name = "altitudes";
		var attribLoc = 3;
		vboKey.setDataArrayCustom(this.altArray, vboMemManager, dimensions, name, attribLoc);
	}
	

	// Make skirt.
	if (this.skirtCartesiansArray === undefined)
	{ return; }

	var skirtCartasiansCount = this.skirtCartesiansArray.length;
	for (var i=0; i<skirtCartasiansCount; i++)
	{
		this.skirtCartesiansArray[i*3] -= this.centerX[0];
		this.skirtCartesiansArray[i*3+1] -= this.centerY[0];
		this.skirtCartesiansArray[i*3+2] -= this.centerZ[0];
	}

	
	var vboKeySkirt = this.vboKeyContainer.newVBOVertexIdxCacheKey();

	// Positions.
	vboKeySkirt.setDataArrayPos(this.skirtCartesiansArray, vboMemManager);
	
	// TexCoords.
	if (this.skirtTexCoordsArray)
	{
		vboKeySkirt.setDataArrayTexCoord(this.skirtTexCoordsArray, vboMemManager);
	}
	
	// Altitudes for skirtData.
	if (this.skirtAltitudesValuesArray)
	{
		var dimensions = 1;
		var name = "altitudes";
		var attribLoc = 3;
		vboKeySkirt.setDataArrayCustom(this.skirtAltitudesValuesArray, vboMemManager, dimensions, name, attribLoc);
	}
};

TinTerrain.getSkirtTrianglesStrip = function(lonArray, latArray, altArray, texCoordsArray, southIndices, eastIndices, northIndices, westIndices, options)
{
	// Given "lonArray", "latArray" & "altArray", this function makes skirtCartesiansArray & skirtTexCoordsArray.***
	// Note: skirtMesh is trianglesStrip, so, there are no indices.***
	var skirtDepth = 5000.0;
	var texCorrectionFactor = 1.0;
	if (options)
	{
		if (options.skirtDepth !== undefined)
		{ skirtDepth = options.skirtDepth; }
	
		if (options.texCorrectionFactor !== undefined)
		{ texCorrectionFactor = options.texCorrectionFactor; }
	}
	
	// Texture correction in borders & make skirt data.***
	var westVertexCount = westIndices.length;
	var southVertexCount = southIndices.length;
	var eastVertexCount = eastIndices.length;
	var northVertexCount = northIndices.length;
	
	var totalVertexCount = westVertexCount + southVertexCount + eastVertexCount + northVertexCount;
	
	var skirtLonArray = new Float32Array(totalVertexCount * 2);
	var skirtLatArray = new Float32Array(totalVertexCount * 2);
	var skirtAltArray = new Float32Array(totalVertexCount * 2);
	var skirtTexCoordsArray = new Float32Array(totalVertexCount * 4);
	var skinAltitudes = new Float32Array(totalVertexCount * 4);
	var counter = 0;
	
	for (var j=0; j<westVertexCount; j++)
	{
		var idx = westIndices[j];
		texCoordsArray[idx*2] += texCorrectionFactor/2;
		
		skirtLonArray[counter] = lonArray[idx];
		skirtLatArray[counter] = latArray[idx];
		skirtAltArray[counter] = altArray[idx];
		
		skirtTexCoordsArray[counter] = texCoordsArray[idx*2];   // s.
		skirtTexCoordsArray[counter] = texCoordsArray[idx*2+1]; // t.
		skinAltitudes[counter] = altArray[idx];
		counter += 1;
		
		skirtLonArray[counter] = lonArray[idx];
		skirtLatArray[counter] = latArray[idx];
		skirtAltArray[counter] = altArray[idx]-skirtDepth;
		
		skirtTexCoordsArray[counter] = texCoordsArray[idx*2];   // s.
		skirtTexCoordsArray[counter] = texCoordsArray[idx*2+1]; // t.
		skinAltitudes[counter] = altArray[idx];
		counter += 1;

	}
	
	for (var j=0; j<southVertexCount; j++)
	{
		var idx = southIndices[j];
		texCoordsArray[idx*2+1] = (texCorrectionFactor);
		
		skirtLonArray[counter] = lonArray[idx];
		skirtLatArray[counter] = latArray[idx];
		skirtAltArray[counter] = altArray[idx];
		
		skirtTexCoordsArray[counter] = texCoordsArray[idx*2];   // s.
		skirtTexCoordsArray[counter] = texCoordsArray[idx*2+1]; // t.
		skinAltitudes[counter] = altArray[idx];
		counter += 1;
		
		skirtLonArray[counter] = lonArray[idx];
		skirtLatArray[counter] = latArray[idx];
		skirtAltArray[counter] = altArray[idx]-skirtDepth;
		
		skirtTexCoordsArray[counter] = texCoordsArray[idx*2];   // s.
		skirtTexCoordsArray[counter] = texCoordsArray[idx*2+1]; // t.
		skinAltitudes[counter] = altArray[idx];
		counter += 1;
	}
	
	for (var j=0; j<eastVertexCount; j++)
	{
		var idx = eastIndices[j];
		texCoordsArray[idx*2] -= texCorrectionFactor/2;
		
		skirtLonArray[counter] = lonArray[idx];
		skirtLatArray[counter] = latArray[idx];
		skirtAltArray[counter] = altArray[idx];
		
		skirtTexCoordsArray[counter] = texCoordsArray[idx*2];   // s.
		skirtTexCoordsArray[counter] = texCoordsArray[idx*2+1]; // t.
		skinAltitudes[counter] = altArray[idx];
		counter += 1;
		
		skirtLonArray[counter] = lonArray[idx];
		skirtLatArray[counter] = latArray[idx];
		skirtAltArray[counter] = altArray[idx]-skirtDepth;
		
		skirtTexCoordsArray[counter] = texCoordsArray[idx*2];   // s.
		skirtTexCoordsArray[counter] = texCoordsArray[idx*2+1]; // t.
		skinAltitudes[counter] = altArray[idx];
		counter += 1;
	}
	
	for (var j=0; j<northVertexCount; j++)
	{
		var idx = northIndices[j];
		texCoordsArray[idx*2+1] = (1-texCorrectionFactor);
		
		skirtLonArray[counter] = lonArray[idx];
		skirtLatArray[counter] = latArray[idx];
		skirtAltArray[counter] = altArray[idx];
		
		skirtTexCoordsArray[counter] = texCoordsArray[idx*2];   // s.
		skirtTexCoordsArray[counter] = texCoordsArray[idx*2+1]; // t.
		skinAltitudes[counter] = altArray[idx];
		counter += 1;
		
		skirtLonArray[counter] = lonArray[idx];
		skirtLatArray[counter] = latArray[idx];
		skirtAltArray[counter] = altArray[idx]-skirtDepth;
		
		skirtTexCoordsArray[counter] = texCoordsArray[idx*2];   // s.
		skirtTexCoordsArray[counter] = texCoordsArray[idx*2+1]; // t.
		skinAltitudes[counter] = altArray[idx];
		counter += 1;
	}
	
	var skirtCartesiansArray = Globe.geographicRadianArrayToFloat32ArrayWgs84(skirtLonArray, skirtLatArray, skirtAltArray, undefined);
	
	var resultObject = {
		skirtCartesiansArray      : skirtCartesiansArray,
		skirtTexCoordsArray       : skirtTexCoordsArray,
		skirtAltitudesArray       : skirtAltArray,
		skirtAltitudesValuesArray : skinAltitudes
	};
	
	return resultObject;
};

TinTerrain.getNormalCartesiansArray = function(cartesiansArray, indicesArray, resultNormalCartesiansArray, options)
{
	var idx_1, idx_2, idx_3;
	var point_1, point_2, point_3;
	var normal;
	var normalsArray = [];
	var trianglesCount = indicesArray.length/3;
	for (var i=0; i<trianglesCount; i++)
	{
		idx_1 = indicesArray[i*3];
		idx_2 = indicesArray[i*3+1];
		idx_3 = indicesArray[i*3+2];
		
		point_1 = new Point3D(cartesiansArray[idx_1*3], cartesiansArray[idx_1*3+1], cartesiansArray[idx_1*3+2]);
		point_2 = new Point3D(cartesiansArray[idx_2*3], cartesiansArray[idx_2*3+1], cartesiansArray[idx_2*3+2]);
		point_3 = new Point3D(cartesiansArray[idx_3*3], cartesiansArray[idx_3*3+1], cartesiansArray[idx_3*3+2]);
		
		// Calculate the normal for this triangle.
		normal = Triangle.calculateNormal(point_1, point_3, point_2, undefined);
		
		// Accum normals for each points.
		// Point 1.***
		if (normalsArray[idx_1] !== undefined)
		{
			normalsArray[idx_1].addPoint(normal);
		}
		else
		{
			normalsArray[idx_1] = normal;
		}
		
		// Point 2.***
		if (normalsArray[idx_2] !== undefined)
		{
			normalsArray[idx_2].addPoint(normal);
		}
		else
		{
			normalsArray[idx_2] = normal;
		}
		
		// Point 3.***
		if (normalsArray[idx_3] !== undefined)
		{
			normalsArray[idx_3].addPoint(normal);
		}
		else
		{
			normalsArray[idx_3] = normal;
		}
	}
	
	// finally, normalize all normals.
	var normalsCount = normalsArray.length;
	if (resultNormalCartesiansArray === undefined)
	{ resultNormalCartesiansArray = new Int8Array(normalsCount*3); }
	
	for (var i=0; i<normalsCount; i++)
	{
		var normal = normalsArray[i];
		normal.unitary();
		
		resultNormalCartesiansArray[i*3] = Math.floor(normal.x*255);
		resultNormalCartesiansArray[i*3+1] = Math.floor(normal.y*255);
		resultNormalCartesiansArray[i*3+2] = Math.floor(normal.z*255);
	}
	
	return resultNormalCartesiansArray;
	
};

TinTerrain.prototype.getAltitudes = function(geoCoordsArray, resultGeoCoordsArray, magoManager)
{
	if (this.altitudesFbo === undefined) 
	{ 
		this.makeAltitudesMap(magoManager);
	}
	
	// Bind this.altitudesFbo and read pixels, then decode the altitude.
	// Convert longitude & latitude to normalized coordinates.
	var minLon = this.geographicExtent.minGeographicCoord.longitude;
	var minLat = this.geographicExtent.minGeographicCoord.latitude;
	var maxLon = this.geographicExtent.maxGeographicCoord.longitude;
	var maxLat = this.geographicExtent.maxGeographicCoord.latitude;
	var lonRange = maxLon - minLon;
	var latRange = maxLat - minLat;
	
	var minHeight = this.minHeight[0];
	var maxHeight = this.maxHeight[0];
	var heightRange = maxHeight - minHeight;
	
	var uValue; // normalized longitude.
	var vValue; // normalized latitude.
	var pixels = new Uint8Array(4); // 4 RGBA.***
	
	var imageWidth = this.altitudesFbo.width;
	var imageHeight = this.altitudesFbo.height;
	
	if (resultGeoCoordsArray === undefined)
	{ resultGeoCoordsArray = []; }

	this.altitudesFbo.bind();
		
	var geoCoordsCount = geoCoordsArray.length;
	for (var i=0; i<geoCoordsCount; i++)
	{
		var geoCoord = geoCoordsArray[i];
		
		uValue = (geoCoord.longitude - minLon)/lonRange;
		vValue = (geoCoord.latitude - minLat)/latRange;
		
		var pixelX = uValue * imageWidth;
		var pixelY = vValue * imageHeight;
		
		gl.readPixels(pixelX, pixelY, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
		
		var decodedAltitude = pixels[0]/(256.0*256.0*256.0) + pixels[1]/(256.0*256.0) + pixels[2]/256.0 + pixels[3]; // 0 to 256 range depth.
		var linearAltitude = decodedAltitude / 256.0; // LinearDepth. Convert to [0.0, 1.0] range depth.
		var realAltitude = minHeight + linearAltitude * heightRange;
		geoCoord.altitude = realAltitude;
		resultGeoCoordsArray.push(geoCoord);
	}
	
	this.altitudesFbo.unbind();
	
	return resultGeoCoordsArray;
};

TinTerrain.prototype.makeAltitudesMap = function(magoManager)
{
	var gl = magoManager.getGl();
	
	if (this.altitudesFbo === undefined) 
	{ 
		var imageWidth = 256;
		var imageHeight = 256;
		this.altitudesFbo = new FBO(gl, imageWidth, imageHeight ); 
	}
	
	var uValues = this.uValues;
	var vValues = this.vValues;
	var hValues = this.hValues;
	var indices = this.indices;
	
	// Make VBO.
	var test_maxUValue;
	var test_maxVValue;
	var test_maxHValue;
	
	var test_minUValue;
	var test_minVValue;
	var test_minHValue;
	
	var shortMax = 32767;
	var vertexCount = uValues.length;
	var cartesiansArray = new Float32Array(vertexCount*3);
	for (var i=0; i<vertexCount; i++)
	{
		cartesiansArray[i*3] = uValues[i]/shortMax;
		cartesiansArray[i*3+1] = vValues[i]/shortMax;
		cartesiansArray[i*3+2] = hValues[i]/shortMax;
		
		// Test to debug.
		if (i === 0)
		{
			test_maxUValue = cartesiansArray[i*3];
			test_maxVValue = cartesiansArray[i*3+1];
			test_maxHValue = cartesiansArray[i*3+2];
			
			test_minUValue = cartesiansArray[i*3];
			test_minVValue = cartesiansArray[i*3+1];
			test_minHValue = cartesiansArray[i*3+2];
		}
		else
		{
			if (cartesiansArray[i*3] < test_minUValue)
			{ test_minUValue = cartesiansArray[i*3]; }
			else if (cartesiansArray[i*3] > test_maxUValue)
			{ test_maxUValue = cartesiansArray[i*3]; }
				
			if (cartesiansArray[i*3+1] < test_minVValue)
			{ test_minVValue = cartesiansArray[i*3+1]; }
			else if (cartesiansArray[i*3+1] > test_maxVValue)
			{ test_maxVValue = cartesiansArray[i*3+1]; }
				
			if (cartesiansArray[i*3+2] < test_minHValue)
			{ test_minHValue = cartesiansArray[i*3+2]; }
			else if (cartesiansArray[i*3+2] > test_maxHValue)
			{ test_maxHValue = cartesiansArray[i*3+2]; }
		}
	}
	
	if (this.vboKeyContainerAltitudes === undefined)
	{ this.vboKeyContainerAltitudes = new VBOVertexIdxCacheKeysContainer(); }
	
	var vboKeyAltitudes = this.vboKeyContainerAltitudes.newVBOVertexIdxCacheKey();
	var vboKey = this.vboKeyContainer.vboCacheKeysArray[0]; // the idx = 0 is the terrain. idx = 1 is the skirt.
	var vboMemManager = magoManager.vboMemoryManager;
	
	// Positions.
	vboKeyAltitudes.setDataArrayPos(cartesiansArray, vboMemManager);
	
	// Indices. 
	// For indices use the tinTerrain VBO indices.
	
	// Calculate the modelViewProjectionMatrix.
	var mvMat = new Matrix4();
	var ortho = new Matrix4();
	this.altitudesMapMVPMat = new Matrix4();
	var nRange = 1.0;
	var left = -nRange, right = nRange, bottom = -nRange, top = nRange, near = -depthFactor*nRange, far = depthFactor*nRange;
	ortho._floatArrays = glMatrix.mat4.ortho(ortho._floatArrays, left, right, bottom, top, near, far);
	
	this.altitudesMapMVPMat = mvMat.getMultipliedByMatrix(ortho, this.altitudesMapMVPMat);
	
	// Now render.
	this.altitudesFbo.bind();
	
	var shaderName = "tinTerrainAltitudes";
	var shader = magoManager.postFxShadersManager.getShader(shaderName); 
	shader.useProgram();
	shader.enableVertexAttribArray(shader.position3_loc);
	
	// Positions.
	if (!vboKeyAltitudes.bindDataPosition(shader, vboMemManager))
	{ 
		return false; 
	}
	
	// Indices.
	if (!vboKey.bindDataIndice(shader, vboMemManager))
	{ 
		return false; 
	}
	
	var indicesCount = vboKey.indicesCount;
	gl.drawElements(gl.TRIANGLES, indicesCount, gl.UNSIGNED_SHORT, 0); // Fill.
	
	this.altitudesFbo.unbind();
};

TinTerrain.prototype.decodeData = function(imageryType)
{
	if (this.geographicExtent === undefined)
	{ return; }
	
	if (this.vertexArray === undefined)
	{ this.vertexArray = []; }
	
	var degToRadFactor = Math.PI/180.0;
	// latitude & longitude in RADIANS.
	var minLon = this.geographicExtent.minGeographicCoord.longitude * degToRadFactor;
	var minLat = this.geographicExtent.minGeographicCoord.latitude * degToRadFactor;
	var maxLon = this.geographicExtent.maxGeographicCoord.longitude * degToRadFactor;
	var maxLat = this.geographicExtent.maxGeographicCoord.latitude * degToRadFactor;
	var lonRange = maxLon - minLon;
	var latRange = maxLat - minLat;
	
	var minHeight = this.minHeight[0];
	var maxHeight = this.maxHeight[0];
	var heightRange = maxHeight - minHeight;
	
	var vertexCount = this.vertexCount[0];
	this.texCoordsArray = new Float32Array(vertexCount*2);
	var lonArray = new Float32Array(vertexCount);
	var latArray = new Float32Array(vertexCount);
	var altArray = new Float32Array(vertexCount);
	var shortMax = 32767; // 65536
	var lonRangeDivShortMax = lonRange/shortMax;
	var latRangeDivShortMax = latRange/shortMax;
	var heightRangeDivShortMax = heightRange/shortMax;
	var uValues = this.uValues;
	var vValues = this.vValues;
	var hValues = this.hValues;
	
	var exageration = 2.0;
	
	if (this.depth === 0)
	{ var hola = 0; }

	if (this.depth === 1)
	{ var hola = 0; }
	
	if (imageryType === undefined)
	{ imageryType = CODE.imageryType.CRS84; }
	
	if (imageryType === CODE.imageryType.WEB_MERCATOR)
	{
		// web_mercator.
		// https://en.wikipedia.org/wiki/Web_Mercator_projection
		var depth = this.depth;
		var PI = Math.PI;
		var aConst = (1.0/(2.0*PI))*Math.pow(2.0, depth);
		var PI_DIV_4 = PI/4;
		var minT = aConst*(PI-Math.log(Math.tan(PI_DIV_4+minLat/2)));
		var maxT = aConst*(PI-Math.log(Math.tan(PI_DIV_4+maxLat/2)));
		var minS = aConst*(minLon+PI);
		var maxS = aConst*(maxLon+PI);
		var floorMinS = Math.floor(minS);
		var t, s;
		
		// Flip texCoordY for minT & maxT.***
		minT = 1.0 - minT;
		maxT = 1.0 - maxT;
		
		//var texCorrectionFactor = 0.0005;
		var texCorrectionFactor = 0.003 + (depth * 0.0000001);
		//var texCorrectionFactor = 0.002 + (1/(depth+1) * 0.008);
	
		for (var i=0; i<vertexCount; i++)
		{
			lonArray[i] = minLon + uValues[i]*lonRangeDivShortMax;
			latArray[i] = minLat + vValues[i]*latRangeDivShortMax;
			altArray[i] = minHeight + hValues[i]*heightRangeDivShortMax;
			

			//if (altArray[i] < 0.0)
			//{ altArray[i] *= exageration; }
			
			var currLon = lonArray[i];
			var currLat = latArray[i];
			
			// make texcoords.
			t = aConst*(PI-Math.log(Math.tan(PI_DIV_4+currLat/2)));
			t = 1.0 - t;
				
			// Substract minT to "t" to make range [0 to 1].***
			t -= minT; 
			
			s = aConst*(currLon+PI);
			s -= floorMinS;
			
			this.texCoordsArray[i*2] = s;
			this.texCoordsArray[i*2+1] = t;
		}
	}
	else
	{
		// crs84.
		for (var i=0; i<vertexCount; i++)
		{
			lonArray[i] = minLon + uValues[i]*lonRangeDivShortMax;
			latArray[i] = minLat + vValues[i]*latRangeDivShortMax;
			altArray[i] = minHeight + hValues[i]*heightRangeDivShortMax;
			
			// make texcoords.
			this.texCoordsArray[i*2] = uValues[i]/shortMax;
			this.texCoordsArray[i*2+1] = vValues[i]/shortMax;
		}
	}
	
	this.cartesiansArray = Globe.geographicRadianArrayToFloat32ArrayWgs84(lonArray, latArray, altArray, this.cartesiansArray);
	
	//this.normalsArray = TinTerrain.getNormalCartesiansArray(this.cartesiansArray, this.indices, undefined, undefined);
	
	var options = {
		skirtDepth          : 50000,
		texCorrectionFactor : texCorrectionFactor
	};
	var skirtResultObject = TinTerrain.getSkirtTrianglesStrip(lonArray, latArray, altArray, this.texCoordsArray, this.southIndices, this.eastIndices, this.northIndices, this.westIndices, options);
	this.skirtCartesiansArray = skirtResultObject.skirtCartesiansArray;
	this.skirtTexCoordsArray = skirtResultObject.skirtTexCoordsArray;
	this.skirtAltitudesArray = skirtResultObject.skirtAltitudesArray;
	this.skirtAltitudesValuesArray = skirtResultObject.skirtAltitudesValuesArray;
	
	// free memory.
	//this.uValues = undefined; // keep values to make altitudesMap.
	//this.vValues = undefined; // keep values to make altitudesMap.
	//this.hValues = undefined; // keep values to make altitudesMap.
	
	// store useful data.
	this.altArray = altArray;
	//this.lonArray = lonArray;
	//this.latArray = latArray;
	
	
};

TinTerrain.prototype.parseData = function(dataArrayBuffer)
{
	this.fileLoadState = CODE.fileLoadState.PARSE_STARTED;
	var bytes_readed = 0;
	
	// 1. header.
	this.centerX = new Float64Array(dataArrayBuffer.slice(bytes_readed, bytes_readed+8)); bytes_readed+=8;
	this.centerY = new Float64Array(dataArrayBuffer.slice(bytes_readed, bytes_readed+8)); bytes_readed+=8;
	this.centerZ = new Float64Array(dataArrayBuffer.slice(bytes_readed, bytes_readed+8)); bytes_readed+=8;
	
	this.minHeight = new Float32Array(dataArrayBuffer.slice(bytes_readed, bytes_readed+4)); bytes_readed+=4;
	this.maxHeight = new Float32Array(dataArrayBuffer.slice(bytes_readed, bytes_readed+4)); bytes_readed+=4;
	
	// In this moment set the altitudes for the geographicExtension.
	this.geographicExtent.setExtent(undefined, undefined, this.minHeight[0], undefined, undefined, this.maxHeight[0]);
	
	this.boundingSphereCenterX = new Float64Array(dataArrayBuffer.slice(bytes_readed, bytes_readed+8)); bytes_readed+=8;
	this.boundingSphereCenterY = new Float64Array(dataArrayBuffer.slice(bytes_readed, bytes_readed+8)); bytes_readed+=8;
	this.boundingSphereCenterZ = new Float64Array(dataArrayBuffer.slice(bytes_readed, bytes_readed+8)); bytes_readed+=8;
	this.boundingSphereRadius = new Float64Array(dataArrayBuffer.slice(bytes_readed, bytes_readed+8)); bytes_readed+=8;
	
	this.horizonOcclusionPointX = new Float64Array(dataArrayBuffer.slice(bytes_readed, bytes_readed+8)); bytes_readed+=8;
	this.horizonOcclusionPointY = new Float64Array(dataArrayBuffer.slice(bytes_readed, bytes_readed+8)); bytes_readed+=8;
	this.horizonOcclusionPointZ = new Float64Array(dataArrayBuffer.slice(bytes_readed, bytes_readed+8)); bytes_readed+=8;
	
	// 2. vertex data.
	this.vertexCount = new Uint32Array(dataArrayBuffer.slice(bytes_readed, bytes_readed+4)); bytes_readed+=4;
	var vertexCount = this.vertexCount[0];
	this.uValues = new Uint16Array(dataArrayBuffer.slice(bytes_readed, bytes_readed + 2 * vertexCount)); bytes_readed += 2 * vertexCount;
	this.vValues = new Uint16Array(dataArrayBuffer.slice(bytes_readed, bytes_readed + 2 * vertexCount)); bytes_readed += 2 * vertexCount;
	this.hValues = new Uint16Array(dataArrayBuffer.slice(bytes_readed, bytes_readed + 2 * vertexCount)); bytes_readed += 2 * vertexCount;
	
	// decode data.
	var u = 0;
	var v = 0;
	var height = 0;
	for (var i=0; i<vertexCount; i++)
	{
		u += this.zigZagDecode(this.uValues[i]);
		v += this.zigZagDecode(this.vValues[i]);
		height += this.zigZagDecode(this.hValues[i]);
		
		this.uValues[i] = u;
		this.vValues[i] = v;
		this.hValues[i] = height;
	}
	
	// 3. indices.
	this.trianglesCount = new Uint32Array(dataArrayBuffer.slice(bytes_readed, bytes_readed + 4)); bytes_readed += 4;
	var trianglesCount = this.trianglesCount;
	if (vertexCount > 65536 )
	{
		this.indices = new Uint32Array(dataArrayBuffer.slice(bytes_readed, bytes_readed + 4 * trianglesCount * 3)); bytes_readed += 4 * trianglesCount * 3;
	}
	else 
	{
		this.indices = new Uint16Array(dataArrayBuffer.slice(bytes_readed, bytes_readed + 2 * trianglesCount * 3)); bytes_readed += 2 * trianglesCount * 3;
	}
	
	// decode indices.
	var code;
	var highest = 0;
	var indicesCount = this.indices.length;
	for (var i=0; i<indicesCount; i++)
	{
		code = this.indices[i];
		this.indices[i] = highest - code;
		if (code === 0) 
		{
			++highest;
		}
	}
	
	// 4. edges indices.
	if (vertexCount > 65536 )
	{
		this.westVertexCount = new Uint32Array(dataArrayBuffer.slice(bytes_readed, bytes_readed + 4)); bytes_readed += 4;
		this.westIndices = new Uint32Array(dataArrayBuffer.slice(bytes_readed, bytes_readed + 4 * this.westVertexCount)); bytes_readed += 4 * this.westVertexCount;
		
		this.southVertexCount = new Uint32Array(dataArrayBuffer.slice(bytes_readed, bytes_readed + 4)); bytes_readed += 4;
		this.southIndices = new Uint32Array(dataArrayBuffer.slice(bytes_readed, bytes_readed + 4 * this.southVertexCount)); bytes_readed += 4 * this.southVertexCount;
		
		this.eastVertexCount = new Uint32Array(dataArrayBuffer.slice(bytes_readed, bytes_readed + 4)); bytes_readed += 4;
		this.eastIndices = new Uint32Array(dataArrayBuffer.slice(bytes_readed, bytes_readed + 4 * this.eastVertexCount)); bytes_readed += 4 * this.eastVertexCount;
		
		this.northVertexCount = new Uint32Array(dataArrayBuffer.slice(bytes_readed, bytes_readed + 4)); bytes_readed += 4;
		this.northIndices = new Uint32Array(dataArrayBuffer.slice(bytes_readed, bytes_readed + 4 * this.northVertexCount)); bytes_readed += 4 * this.northVertexCount;
	}
	else
	{
		this.westVertexCount = new Uint32Array(dataArrayBuffer.slice(bytes_readed, bytes_readed + 4)); bytes_readed += 4;
		this.westIndices = new Uint16Array(dataArrayBuffer.slice(bytes_readed, bytes_readed + 2 * this.westVertexCount)); bytes_readed += 2 * this.westVertexCount;
		
		this.southVertexCount = new Uint32Array(dataArrayBuffer.slice(bytes_readed, bytes_readed + 4)); bytes_readed += 4;
		this.southIndices = new Uint16Array(dataArrayBuffer.slice(bytes_readed, bytes_readed + 2 * this.southVertexCount)); bytes_readed += 2 * this.southVertexCount;
		
		this.eastVertexCount = new Uint32Array(dataArrayBuffer.slice(bytes_readed, bytes_readed + 4)); bytes_readed += 4;
		this.eastIndices = new Uint16Array(dataArrayBuffer.slice(bytes_readed, bytes_readed + 2 * this.eastVertexCount)); bytes_readed += 2 * this.eastVertexCount;
		
		this.northVertexCount = new Uint32Array(dataArrayBuffer.slice(bytes_readed, bytes_readed + 4)); bytes_readed += 4;
		this.northIndices = new Uint16Array(dataArrayBuffer.slice(bytes_readed, bytes_readed + 2 * this.northVertexCount)); bytes_readed += 2 * this.northVertexCount;
	}
	
	// 5. extension header.
	this.extensionId = new Uint8Array(dataArrayBuffer.slice(bytes_readed, bytes_readed + 1)); bytes_readed += 1;
	this.extensionLength = new Uint32Array(dataArrayBuffer.slice(bytes_readed, bytes_readed + 4)); bytes_readed += 4;
	
	this.fileLoadState = CODE.fileLoadState.PARSE_FINISHED;
	
	if (this.extensionId.length === 0)
	{
		dataArrayBuffer = undefined;
		return;
	}
	
	dataArrayBuffer = undefined;
};























































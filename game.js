/* JS for Battleship, currently tested only with board size of 10x10 cells */
/* Built around the idea that I'll come back later and add functions to support different sized boards */

// of_cell => Offensive cell, so one that the player shoots at
// df_cell => Defensive cell, one that the AI shoots at

/////////////////////////////////////////////////////////////////////////
/*                        Global Variables                             */
/////////////////////////////////////////////////////////////////////////

// An object that keeps track of the game
var game;
// An object that holds AI specific data
var aIBrain;
// Game Constants
var CONSTS = {
    values: {
        empty: 0,
        ship: 1,
        hit: 2,
        miss: -1
    },
    contentClasses: {
        empty: "content_empty",
        hit: "content_hit",
        miss: "content_miss",
        ship: "content_ship"
    },
    highlightClasses: {
        none: "highlight_none",
        ok: "highlight_ok",
        invalid: "highlight_invalid",
        rail: "highlight_rail",
        ship: "highlight_ship"
    },
    weapons: {
        standard: "Standard Artillery",
        scan: "Deep Sea Scanner",
        torpedo: "Torpedo Launcher",
        rail: "Electromagnetic Rail Gun",
        bomb: "Cluster Bomb"
    },
    rotation: {
        none: 0,
        diag: 90,
        flip: 180,
        antidiag: 270
    },
    ships: {
        patrol: "Patrol Boat",        // 2 length
        sub: "Submarine",             // 3 length
        destroyer: "Destroyer",       // 3 length
        battleship: "Battleship",     // 4 length
        carrier: "Carrier"            // 5 length
    }
};

/////////////////////////////////////////////////////////////////////////
/*                             Helpers                                 */
/////////////////////////////////////////////////////////////////////////

// Clears all the highlighting on the rotate board
function clearRotateBoard() {
    $("#rt_board").find(".cell").each(function() {
        setHighlightClass($(this)[0].id, CONSTS.highlightClasses.none);
    });
}

// Generates a standardized error message
function createErrorMessage(callFunc, error) {
    return "Error in " + callFunc + ": " + error;
}

// Constructs a cell Id based on the row, column number, and state of cell (of or df)
function constructId (row, col, isOf) {
    if (isOf) {
        return "cell_of_" + row + "_" + col;
    }
    return "cell_df_" + row + "_" + col;
}

// Constructs a cell Id based on the row, column number for the special rotate display table
function constructRotateCellId (row, col) {
    return "cell_rt_" + row + "_" + col;
}

// Creates a data representation for an empty board
function createEmptyBoard(rows, cols) {
    var output = [];
    for (var i = 0; i < rows; i++) {
        output.push([]);
        for (var j = 0; j < cols; j++) {
            output[i].push(CONSTS.values.empty);
        }
    }
    return output;
}

// Function run when game ends
function endGame(isPlayerWin) {
    if (isPlayerWin) {
        alert("Congrats, you win!");
    } else {
        alert("Oh no, the computer has defeated you!");
    }
}

// Executes func(row, col) on every cell for the ship placement regardless of if the placement is valid
// Placement determined centerRow, centerCol, and size
function executeOnShipCells(centerRow, centerCol, rotation, size, func) {
    var offset = Math.floor(size / 2);

    for (var i = 0; i < size; i ++) {
        var row;
        var col;
        if (rotation == CONSTS.rotation.none) {
            row = centerRow - offset + i;
            col = centerCol;
        } else if (rotation == CONSTS.rotation.diag) {
            row = centerRow - offset + i;
            col = centerCol - offset + i;
        } else if (rotation == CONSTS.rotation.flip) {
            row = centerRow;
            col = centerCol - offset + i;
        } else if (rotation == CONSTS.rotation.antidiag) {
            row = centerRow - offset + i;
            col = centerCol + offset - i;
        }

        func(row, col);
    }
}

// Generates the UI for a single board based on if the board isOf
function generateSingleBoardUI (isOf, rows, cols) {
    for (var i = 0; i < rows; i++) {
        var row = document.createElement("tr");
        for (var j = 0; j < cols; j++) {
            var cell = document.createElement("td");
            cell.className = "cell " + CONSTS.contentClasses.empty + " " + CONSTS.highlightClasses.none;
            cell.id = constructId(i, j, isOf);
            cell.addEventListener('mouseover', function(){
                onCellHover($(this)[0].id);
            });
            cell.addEventListener('mouseout', function(){
                onCellUnHover($(this)[0].id);
            });
            if (isOf) {
                cell.addEventListener('click', function(){
                    if (!game.isPlayerSetup) {
                        playerShoot($(this)[0].id);
                    }
                });
            } else {
                cell.addEventListener('click', function(){
                    if (game.isPlayerSetup) {
                        playerSetup($(this)[0].id);
                    }
                });
            }
            row.appendChild(cell);
        }
        $(isOf ? "#of_board" : "#df_board").append(row);
    }
}

// Returns a list of all the cell ids on dfBoard that haven't been shot at yet
function getAvailableDfBoardCells() {
    var output = [];
    $("#df_board").find(".cell").each(function() {
        var cellData = parseId($(this)[0].id);
        if (game.dfBoard[cellData.row][cellData.col] == CONSTS.values.ship ||
            game.dfBoard[cellData.row][cellData.col] == CONSTS.values.empty) {
            output.push($(this)[0].id);
        }
    });

    return output;
}

// Returns the function corresponding to the weapon's target function
function getCurrentWeaponTargetFunc() {
    if (game.playerWeapon.weapon == CONSTS.weapons.standard) {
        return targetNormal;
    } else if (game.playerWeapon.weapon == CONSTS.weapons.torpedo) {
        return targetTorpedo;
    } else if (game.playerWeapon.weapon == CONSTS.weapons.bomb) {
        return targetBomb;
    } else if (game.playerWeapon.weapon == CONSTS.weapons.rail) {
        return targetRail;
    }
}

// Returns the function corresponding to the weapon's fire function
function getCurrentWeaponFireFunc() {
    if (game.playerWeapon.weapon == CONSTS.weapons.standard) {
        return fireNormal;
    } else if (game.playerWeapon.weapon == CONSTS.weapons.torpedo) {
        return fireTorpedo;
    } else if (game.playerWeapon.weapon == CONSTS.weapons.bomb) {
        return fireBomb;
    } else if (game.playerWeapon.weapon == CONSTS.weapons.rail) {
        return fireRail;
    }
}

// Returns the data describing the position and rotation of a ship
function getShipData(shipName, isPlayerShip) {
    var shipDataList = isPlayerShip ? game.playerShips : game.aIShips;
    if (shipName == CONSTS.ships.patrol) {
        return shipDataList.patrol;
    } else if (shipName == CONSTS.ships.sub) {
        return shipDataList.sub;
    } else if (shipName == CONSTS.ships.destroyer) {
        return shipDataList.destroyer;
    } else if (shipName == CONSTS.ships.battleship) {
        return shipDataList.battleship;
    } else if (shipName == CONSTS.ships.carrier) {
        return shipDataList.carrier;
    }
}

// Returns the length of a ship (in cells taken up on the board). If the ship is invalid, returns -1
function getShipLength(shipName) {
    if (shipName == CONSTS.ships.patrol) {
        return 2;
    } else if (shipName == CONSTS.ships.sub) {
        return 3;
    } else if (shipName == CONSTS.ships.destroyer) {
        return 3;
    } else if (shipName == CONSTS.ships.battleship) {
        return 4;
    } else if (shipName == CONSTS.ships.carrier) {
        return 5;
    }
    return -1;
}

// Returns the name of the ship with a part of it located at row, col. Returns empty string if no ship there
function getShipAt(row, col, isPlayerShip) {
    var shipDataList = isPlayerShip ? game.playerShips : game.aIShips;
    if (!isValidCell(row, col)) {
        return "";
    }
    var shipName = "";
    if (shipContainsCell(row, col, shipDataList.patrol, CONSTS.ships.patrol)) {
        shipName = CONSTS.ships.patrol;
    } else if (shipContainsCell(row, col, shipDataList.sub, CONSTS.ships.sub)) {
        shipName = CONSTS.ships.sub;
    } else if (shipContainsCell(row, col, shipDataList.destroyer, CONSTS.ships.destroyer)) {
        shipName = CONSTS.ships.destroyer;
    } else if (shipContainsCell(row, col, shipDataList.battleship, CONSTS.ships.battleship)) {
        shipName = CONSTS.ships.battleship;
    } else if (shipContainsCell(row, col, shipDataList.carrier, CONSTS.ships.carrier)) {
        shipName = CONSTS.ships.carrier;
    }
    return shipName;
}

// Returns a random integer between min (included) and max (excluded)
// Using Math.round() will give you a non-uniform distribution!
function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min)) + min;
}

// If the cell was hit, checks if the ship was sunk. If the ship was sunk, adds it to the proper list of sunk ships
// and checks if the game is over
function handleShotSuccess(status, targetCellId, isAI) {
    if (status.isHit) {
        var cellData = parseId(targetCellId);
        var hitShipName = getShipAt(cellData.row, cellData.col, isAI);
        if (isShipDestroyed(hitShipName, isAI)) {
            var sinkList = isAI ? game.sunkPlayerShips : game.sunkAIShips;
            sinkList.push(hitShipName);
            if (sinkList.length == 5) {
                endGame(!isAI);
            }
        }
    }
}

// Returns true if the ship has been destroyed
function isShipDestroyed(shipName, isPlayerShip) {
    var shipData = getShipData(shipName, isPlayerShip);
    var board = isPlayerShip ? game.dfBoard : game.ofBoard;
    var isDestroyed = true;
    executeOnShipCells(shipData.centerRow, shipData.centerCol, shipData.rotation, getShipLength(shipName),
                       function(row, col) {
        isDestroyed = isDestroyed && board[row][col] == CONSTS.values.hit;
    });
    return isDestroyed;
}

// Returns true if the cell exists, otherwise false
function isValidCell(row, col) {
    return !(row < 0 || row > game.size.rows - 1 || col < 0 || col > game.size.cols - 1);
}

// Returns true if the cell can be shot at
function isValidPlayerShot(cellData) {
    return cellData.isOf &&(game.ofBoard[cellData.row][cellData.col] == CONSTS.values.empty ||
           game.ofBoard[cellData.row][cellData.col] == CONSTS.values.ship)
}

// Returns true if a ship can be placed there, false otherwise
function isValidShipLocation(row, col, rotation, size) {
    var isValid = true;
    executeOnShipCells(row, col, rotation, size, function(row, col) {
        isValid = isValid && isValidCell(row, col);
    });
    return isValid;
}

// Parses a cell id in to an object with rows and columns
// Assumes format is 'cell_rowNum_colNum' where rowNum and colNum are integers
function parseId(id) {
    var infoStr = id.substring(id.indexOf('_') + 1, id.length); // Should be board_rowNum_colNum
    var board = infoStr.substring(0, infoStr.indexOf('_'));

    var coordinateString = infoStr.substring(infoStr.indexOf('_') + 1, infoStr.length); // Should be rowNum_colNum
    var rowNum = coordinateString.substring(0, coordinateString.indexOf('_'));
    var colNum = coordinateString.substring(coordinateString.indexOf('_') + 1, coordinateString.length);

    return {
        isOf: board === "of",
        isRt: board === "rt",
        row: parseInt(rowNum),
        col: parseInt(colNum)
    };
}

// Places a ship on the board, updating the UI and game object
function placeShip(centerRow, centerCol, rotation, shipName, isPlayer) {
    setShipCoords(centerRow, centerCol, rotation, shipName, isPlayer);
    executeOnShipCells(centerRow, centerCol, rotation, getShipLength(shipName), function(row, col) {
        if (isPlayer) {
            game.dfBoard[row][col] = CONSTS.values.ship;
        } else {
            game.ofBoard[row][col] = CONSTS.values.ship;
        }
        setContentClass(constructId(row, col, !isPlayer), CONSTS.contentClasses.ship);
    });
}

// Rotates the ship 90 degrees
function rotateShip() {
    if (game.setup.shipRotate == 270) {
        game.setup.shipRotate = 0;
    } else {
        game.setup.shipRotate = game.setup.shipRotate + 90;
    }
}

// Rotates the weapon 90 degrees
function rotateWeapon() {
    if (game.playerWeapon.rotation == 270) {
        game.playerWeapon.rotation = 0;
    } else {
        game.playerWeapon.rotation = game.playerWeapon.rotation + 90;
    }

    $("#rotate_display").html(game.playerWeapon.rotation + " degrees");

    updateRotateBoard();
}

// Sets the class corresponding to the content of the cell to contentClass
function setContentClass (cellId, contentClass) {
    $("#" + cellId).attr('class',
        function(i, c){
            return c.replace(/(^|\s)content_\S+/g, " " + contentClass);
        });
}

// Sets the class corresponding to the highlighting state of the cell to highlightingClass
function setHighlightClass (cellId, highlightClass) {
    $("#" + cellId).attr('class',
        function(i, c){
            return c.replace(/(^|\s)highlight_\S+/g, " " + highlightClass);
        });
}

// Sets the highlight class of a ship
function setHighlightShipClass (shipName, highlightClass, isPlayer) {
    var shipListId = isPlayer ? "player_ships" : "ai_ships";
    setHighlightClass($("#" + shipListId).find(".ship_select:contains('" + shipName + "')")[0].id, highlightClass);
}

// Sets the highlight class of the cell and updates the game
function highlightCell (cellId, highlightClass) {
    var cellData = parseId(cellId);

    if (!cellData.isRt) {
        if (game.hoveredCells.cellIds.length > 0 && (cellData.isOf != game.hoveredCells.isOfBoard)) {
            throw createErrorMessage("highlightCell", "Cannot hover over cells on both boards");
        }
        game.hoveredCells.isOfBoard = cellData.isOf;
        game.hoveredCells.cellIds.push(cellId);
    }

    setHighlightClass(cellId, highlightClass)
}

// Sets the center coordinates of a ship
function setShipCoords(centerRow, centerCol, rotation, shipName, isPlayerShip) {
    var shipSave = isPlayerShip ? game.playerShips : game.aIShips;
    var ship;
    if (shipName == CONSTS.ships.patrol) {
        ship = shipSave.patrol;
    } else if (shipName == CONSTS.ships.sub) {
        ship = shipSave.sub;
    } else if (shipName == CONSTS.ships.destroyer) {
        ship = shipSave.destroyer;
    } else if (shipName == CONSTS.ships.battleship) {
        ship = shipSave.battleship;
    } else if (shipName == CONSTS.ships.carrier) {
        ship = shipSave.carrier;
    }
    ship.centerCol = centerCol;
    ship.centerRow = centerRow;
    ship.rotation = rotation;
}

// Returns true if the cell with row, col is part of the ship, false otherwise
function shipContainsCell(row, col, shipData, shipName) {
    var contains = false;
    executeOnShipCells(shipData.centerRow, shipData.centerCol, shipData.rotation, getShipLength(shipName),
                       function(r, c) {
        contains = contains || (r == row && c == col);
    });
    return contains;
}

// If possible, updates the cell in board with a shot
function shootCell(row, col, board) {
    var status = {
        success: false,
        message: "Cell has already been shot",
        isHit: false
    };
    if (!isValidCell(row, col)) {
        status.message = "Invalid cell location";
        return status;
    }
    if (board[row][col] == CONSTS.values.ship) {
        board[row][col] = CONSTS.values.hit;
        status.success = true;
        status.isHit = true;
        status.message = "A ship was hit!";
    } else if (board[row][col] == CONSTS.values.empty) {
        status.success = true;
        board[row][col] = CONSTS.values.miss;
        status.message = "Shot missed";
    }

    return status;
}


// Un-highlights all cells on the of and df boards
function unHighlightAllCells () {
    for (var i = 0; i < game.hoveredCells.cellIds.length; i++) {
        setHighlightClass (game.hoveredCells.cellIds[i], CONSTS.highlightClasses.none);
    }

    game.hoveredCells.cellIds = [];
}

// Updates the rotate board
function updateRotateBoard() {
    clearRotateBoard();
    var targetWeaponFunc = getCurrentWeaponTargetFunc();
    targetWeaponFunc(1, 1, constructRotateCellId);
}

/////////////////////////////////////////////////////////////////////////
/*                        Page Initialization                          */
/////////////////////////////////////////////////////////////////////////
// Generates the UIs for the two boards and sets up the game
function initializeGame(rows, cols) {
    // of board
    generateSingleBoardUI(true, rows, cols);

    // df board
    generateSingleBoardUI(false, rows, cols);

    // game
    setGameState(rows, cols);

    // aIBrain
    initAI(rows, cols);
}

// Sets up the AI with the tools it will need to start
function initAI(rows, cols) {
    if (rows != 10 && cols != 10) {
        throw createErrorMessage("initAI", "Board size not supported");
    }
    aIBrain = {
        possibleSetups: [
            [
                {
                    centerRow: 2,
                    centerCol: 8,
                    rotation: 0
                },{
                    centerRow: 9,
                    centerCol: 1,
                    rotation: CONSTS.rotation.flip
                },{
                    centerRow: 4,
                    centerCol: 7,
                    rotation: CONSTS.rotation.diag
                },{
                    centerRow: 2,
                    centerCol: 2,
                    rotation: CONSTS.rotation.antidiag
                },{
                    centerRow: 6,
                    centerCol: 3,
                    rotation: CONSTS.rotation.flip
                }
            ]
        ]
    };
}

// Sets up the game
function setGameState(rows, cols) {
    game = {
        isPlayerSetup: true,
        isPlayerTurn: true,
        size: {
            rows: rows,
            cols: cols
        },
        ofBoard: createEmptyBoard(rows, cols),
        dfBoard: createEmptyBoard(rows, cols),
        setup: {
            shipSelect: "",
            shipRotate: 0
        },
        hoveredCells: {
            isOfBoard: false,
            cellIds: [],
            centerId: ""
        },
        playerWeapon: {
            rotation: CONSTS.rotation.none,
            weapon: CONSTS.weapons.standard
        },
        playerAmmo: {
            torpedo: 2,
            bomb: 2
        },
        playerShips: {
            patrol: {
                centerRow: -1,
                centerCol: -1,
                rotation: 0
            },
            sub: {
                centerRow: -1,
                centerCol: -1,
                rotation: 0
            },
            destroyer: {
                centerRow: -1,
                centerCol: -1,
                rotation: 0
            },
            battleship: {
                centerRow: -1,
                centerCol: -1,
                rotation: 0
            },
            carrier: {
                centerRow: -1,
                centerCol: -1,
                rotation: 0
            }
        },
        sunkPlayerShips: [],
        aIAmmo: {
            torpedo: 2,
            bomb: 2
        },
        aIShips: {
            patrol: {
                centerRow: -1,
                centerCol: -1,
                rotation: 0
            },
            sub: {
                centerRow: -1,
                centerCol: -1,
                rotation: 0
            },
            destroyer: {
                centerRow: -1,
                centerCol: -1,
                rotation: 0
            },
            battleship: {
                centerRow: -1,
                centerCol: -1,
                rotation: 0
            },
            carrier: {
                centerRow: -1,
                centerCol: -1,
                rotation: 0
            }
        },
        sunkAIShips: [],
    }
}

/////////////////////////////////////////////////////////////////////////
/*                    Main Game Engine Functions                       */
/////////////////////////////////////////////////////////////////////////

// Decides what to do when the user hovers the mouse over a cell
/*
    If in the setup phase...
        * Offensive board: do nothing
        * Defensive board: highlight selected ship setup locations
    Otherwise...
        * Offensive board: highlight shot possibilities
        * Defensive board: do nothing
 */
function onCellHover(id) {
    var cellData = parseId(id);
    game.hoveredCells.centerId = id;

    if (game.isPlayerSetup && !cellData.isOf && game.setup.shipSelect) {
        var highlightClass = CONSTS.highlightClasses.ok;
        if (!isValidShipLocation(cellData.row, cellData.col, game.setup.shipRotate, getShipLength(game.setup.shipSelect))) {
            highlightClass = CONSTS.highlightClasses.invalid;
        }

        executeOnShipCells(cellData.row, cellData.col, game.setup.shipRotate, getShipLength(game.setup.shipSelect), function(row, col) {
            if (isValidCell(row, col)) {
                highlightCell(constructId(row, col, false), highlightClass);
            }
        });
    }

    if (!game.isPlayerSetup && cellData.isOf) {
        // Highlight shot locations
        if (isValidPlayerShot(cellData)) {
            var targetWeaponFunc = getCurrentWeaponTargetFunc();
            targetWeaponFunc(cellData.row, cellData.col, constructId);
        }
    }
}



function onCellUnHover(id) {
    game.hoveredCells.centerId = "";
    unHighlightAllCells();
}


// Attempts to set up one of the player's ships at the cell with id
function playerSetup(id) {
    var cellData = parseId(id);

    if (game.setup.shipSelect && isValidShipLocation(cellData.row, cellData.col, game.setup.shipRotate,
                                                     getShipLength(game.setup.shipSelect))) {
        // Update UI
        setHighlightShipClass(game.setup.shipSelect, CONSTS.highlightClasses.none, true);
        var shipSelector = $(".ship_select:contains('" + game.setup.shipSelect + "')");
        shipSelector.removeClass("placing").addClass("placed");

        placeShip(cellData.row, cellData.col, game.setup.shipRotate, game.setup.shipSelect, true);
        unHighlightAllCells();
        game.setup.shipSelect = "";

        // Check if the player is done placing their ships
        if ($(".placing").length == 0) {
            setupAIShips();
        }
    }
}

// Attempts to update the game with a shot by the player on a cell with id
function playerShoot(id) {
    if (game.isPlayerTurn) {
        var fireWeaponFunc = getCurrentWeaponFireFunc();
        var status = fireWeaponFunc(id);
        if (status.success) {
            makeAIMove();
        }
    }
}


/////////////////////////////////////////////////////////////////////////
/*                        Weapon Functions                             */
/////////////////////////////////////////////////////////////////////////

/**
 * All Firing functions formatted as: function(row, col)
 * They update the cell, ship statuses,
 * They return an object with the following: bool success, string message, bool isHit
 **/
function fireNormal(id) {
    var cellData = parseId(id);
    var board = (game.isPlayerTurn ? game.ofBoard : game.dfBoard);
    var status = shootCell(cellData.row, cellData.col, board);
    if (!status.success) {
        return status;
    }
    setContentClass(id, status.isHit ? CONSTS.contentClasses.hit : CONSTS.contentClasses.miss);

    if (status.success) {
        handleShotSuccess(status, constructId(cellData.row, cellData.col, game.isPlayerTurn), !game.isPlayerTurn);
    }

    game.isPlayerTurn = !game.isPlayerTurn;
    if (game.isPlayerTurn) {
        unHighlightAllCells();
    }

    return status;
}

function fireBomb(id) {
    var cellData = parseId(id);
    var board = (game.isPlayerTurn ? game.ofBoard : game.dfBoard);
    // Ensure valid location by checking the corners
    if (!isValidCell(cellData.row - 1, cellData.col - 1) || !isValidCell(cellData.row + 1, cellData.col + 1)) {
        return {
            success: false,
            message: "Invalid weapon placement",
            isHit: false
        }
    }

    var isHit = false;
    executeFuncOnBombCells(cellData.row, cellData.col, function(row, col) {
        var status = shootCell(row, col, board);
        if (status.success) {
            setContentClass(constructId(row, col, game.isPlayerTurn),
                status.isHit ? CONSTS.contentClasses.hit : CONSTS.contentClasses.miss);
            isHit = isHit || status.isHit;
            handleShotSuccess(status, constructId(row, col, game.isPlayerTurn), !game.isPlayerTurn);
        }
    });

    game.isPlayerTurn = !game.isPlayerTurn;
    if (game.isPlayerTurn) {
        unHighlightAllCells();
    }

    return {
        success: true,
        message: "",
        isHit: false
    }
}

function fireRail(id) {
    // TODO: Change so if it hits a ship, it wipes the whole thing out
    return fireNormal(id);
}

/**
 * All targeting functions formatted as: function(row, col, idConstructFunction)
 * They update the board's highlighting
 **/
function targetBomb(row, col, idConstructFunction) {
    row = parseInt(row);
    col = parseInt(col);

    var highlightClass = CONSTS.highlightClasses.ok;
    if (!isValidCell(row - 1, col - 1) || !isValidCell(row + 1, col + 1)) {
        highlightClass = CONSTS.highlightClasses.invalid;
    }

    executeFuncOnBombCells(row, col, function(row, col) {
        if (isValidCell(row, col)) {
            highlightCell(idConstructFunction(row, col, true), highlightClass);
        }
    });
}

function targetNormal(row, col, idConstructFunction) {
    highlightCell(idConstructFunction(row, col, true), CONSTS.highlightClasses.ok);
}

function targetTorpedo(row, col, idConstructFunction) {
    var isRotate = idConstructFunction === constructRotateCellId;

    if (game.playerWeapon.rotation == CONSTS.rotation.none || game.playerWeapon.rotation == CONSTS.rotation.flip) {
        for (var i = 0; i < (isRotate ? 3 : game.size.cols); i++) {
            highlightCell(idConstructFunction(row, i, true), CONSTS.highlightClasses.ok);
        }
    } else if (game.playerWeapon.rotation == CONSTS.rotation.diag ||
               game.playerWeapon.rotation == CONSTS.rotation.antidiag) {
        for (var j = 0; j < (isRotate ? 3 : game.size.rows); j++) {
            highlightCell(idConstructFunction(j, col, true), CONSTS.highlightClasses.ok);
        }
    }
}

function targetRail(row, col, idConstructFunction) {
    highlightCell(idConstructFunction(row, col, true), CONSTS.highlightClasses.rail);
}


// Executes func on each cell in the bomb firing pattern determined by the centerRow, centerCol
// Func passed row and col parameters
function executeFuncOnBombCells(centerRow, centerCol, func) {
    if (game.playerWeapon.rotation == CONSTS.rotation.none || game.playerWeapon.rotation == CONSTS.rotation.flip) {
        for (var i = -1; i <= 1; i++) {
            func(centerRow + i, centerCol + i);
            func(centerRow + i, centerCol - i);
        }
    } else if (game.playerWeapon.rotation == CONSTS.rotation.diag ||
        game.playerWeapon.rotation == CONSTS.rotation.antidiag) {
        for (var j = -1; j <= 1; j++) {
            func(centerRow, centerCol + j);
            func(centerRow + j, centerCol);
        }
    }
}

/////////////////////////////////////////////////////////////////////////
/*                               AI                                    */
/////////////////////////////////////////////////////////////////////////

// Dictates how the AI will do it's turn
function makeAIMove() {
    // TODO: Add difficulty levels and incorporate use of weapons
    var openShots = getAvailableDfBoardCells();
    var targetCellId = openShots[getRandomInt(0, openShots.length)];
    var status = fireNormal(targetCellId);
    if (!status.success) {
        throw createErrorMessage("makeAIMove", "Unsuccessful AI move order")
    }

}

// Dictates how the AI chooses to set up it's ships
function setupAIShips() {
    var setup = aIBrain.possibleSetups[getRandomInt(0, aIBrain.possibleSetups.length - 1)];
    placeShip(setup[0].centerRow, setup[0].centerCol, setup[0].rotation, CONSTS.ships.patrol, false);
    placeShip(setup[1].centerRow, setup[1].centerCol, setup[1].rotation, CONSTS.ships.sub, false);
    placeShip(setup[2].centerRow, setup[2].centerCol, setup[2].rotation, CONSTS.ships.destroyer, false);
    placeShip(setup[3].centerRow, setup[3].centerCol, setup[3].rotation, CONSTS.ships.battleship, false);
    placeShip(setup[4].centerRow, setup[4].centerCol, setup[4].rotation, CONSTS.ships.carrier, false);
    game.isPlayerSetup = false;
}

/////////////////////////////////////////////////////////////////////////
/*                           Run On Eval                               */
/////////////////////////////////////////////////////////////////////////
initializeGame(10, 10);

$(".weapon_select").each(function() {
    $(this).click(function() {
        game.playerWeapon.weapon = $(this).html();
        updateRotateBoard();
    });
});

$("#player_ships").find(".ship_select").each(function() {
    $(this).click(function() {
        if ($(this).hasClass("placing")) {
            if (game.setup.shipSelect) {
                setHighlightShipClass(game.setup.shipSelect, CONSTS.highlightClasses.none, true);
            }
            game.setup.shipSelect = $(this).html();
            game.setup.shipRotate = 0;
            setHighlightShipClass(game.setup.shipSelect, CONSTS.highlightClasses.ok, true);
        }
    });
    $(this)[0].addEventListener('mouseover', function(){
        var shipName = $(this).html();
        var shipData = getShipData(shipName, true);
        if (shipData.centerRow != -1 && shipData.centerCol != -1) {
            executeOnShipCells(shipData.centerRow, shipData.centerCol, shipData.rotation, getShipLength(shipName),
                function (row, col) {
                    highlightCell(constructId(row, col, false), CONSTS.highlightClasses.ship);
                });
        }
    });
    $(this)[0].addEventListener('mouseout', function(){
        unHighlightAllCells();
    });
});

$("#rotate_button").click(rotateWeapon);

$(document).keypress(function(event) {
    if (String.fromCharCode(event.charCode).toLowerCase() == "r") { // R key is pressed
        if (game.isPlayerSetup) {
            rotateShip();
        } else {
            rotateWeapon();
        }
        // Reset the highlighting
        unHighlightAllCells();
        onCellHover(game.hoveredCells.centerId);
    }
});
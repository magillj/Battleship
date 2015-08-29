/* JS for Battleship, currently tested only with board size of 10x10 cells */
/* Built around the idea that I'll come back later and add functions to support different sized boards */

// of_cell => Offensive cell, so one that the player shoots at
// df_cell => Defensive cell, one that the AI shoots at

/////////////////////////////////////////////////////////////////////////
/*                        Global Variables                             */
/////////////////////////////////////////////////////////////////////////

// An object that keeps track of the game
var game;
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
        miss: "content_miss"
    },
    highlightClasses: {
        none: "highlight_none",
        ok: "highlight_ok",
        invalid: "highlight_invalid"
    },
    weapons: {
        standard: "Standard Artillery",
        scan: "Deep Sea Scanner",
        torpedo: "Torpedo Launcher",
        rail: "Electromagnetic Rail Gun",
        bomb: "Cluster Bombing Run"
    },
    rotation: {
        none: 0,
        diag: 90,
        flip: 180,
        antidiag: 270
    }
};

/////////////////////////////////////////////////////////////////////////
/*                             Helpers                                 */
/////////////////////////////////////////////////////////////////////////
// Returns a random integer between min (included) and max (excluded)
// Using Math.round() will give you a non-uniform distribution!
function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min)) + min;
}

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
                    playerShoot($(this)[0].id);
                });
            } else {
                cell.addEventListener('click', function(){
                    playerSetup($(this)[0].id);
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
        output.push($(this)[0].id)
    });

    return output;
}

// Returns the function corresponding to the weapon's target function
function getCurrentWeaponTargetFunc() {
    if (game.playerWeapon.weapon == CONSTS.weapons.standard) {
        return targetNormal;
    } else if (game.playerWeapon.weapon == CONSTS.weapons.torpedo) {
        return targetTorpedo;
    }
}

// Returns the function corresponding to the weapon's fire function
function getCurrentWeaponFireFunc() {
    if (game.playerWeapon.weapon == CONSTS.weapons.standard) {
        return fireNormal;
    } else if (game.playerWeapon.weapon == CONSTS.weapons.torpedo) {
        return fireTorpedo;
    }
}

// Returns a random integer between min (included) and max (excluded)
// Using Math.round() will give you a non-uniform distribution!
function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min)) + min;
}

// Returns true if the cell can be shot at
function isValidPlayerShot(cellData) {
    return cellData.isOf &&(game.ofBoard[cellData.row][cellData.col] == CONSTS.values.empty ||
           game.ofBoard[cellData.row][cellData.col] == CONSTS.values.ship)
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
        row: rowNum,
        col: colNum
    };
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

function setHighlightClass (cellId, highlightClass) {
    $("#" + cellId).attr('class',
        function(i, c){
            return c.replace(/(^|\s)highlight_\S+/g, " " + highlightClass);
        });
}

// Sets the highlight class of the cell and updates the game
function highlightCell (cellId, highlightClass) {
    var cellData = parseId(cellId);

    if (game.hoveredCells.cellIds.length > 0 && (cellData.isOf != game.hoveredCells.isOfBoard)) {
        throw createErrorMessage("highlightCell", "Cannot hover over cells on both boards");
    }

    if (!cellData.isRt) {
        game.hoveredCells.isOfBoard = cellData.isOf;
        game.hoveredCells.cellIds.push(cellId);
    }

    setHighlightClass(cellId, highlightClass)
}

// If possible, updates the cell in board with a shot
function shootCell(row, col, board) {
    var status = {
        success: false,
        message: "Cell has already been shot",
        isHit: false
    };
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
    status.success = true;

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
    setGamestate(rows, cols);
}

// Sets up the game
function setGamestate(rows, cols) {
    game = {
        isPlayerSetup: false,
        isPlayerTurn: true,
        size: {
            rows: rows,
            cols: cols
        },
        ofBoard: createEmptyBoard(rows, cols),
        dfBoard: createEmptyBoard(rows, cols),
        hoveredCells: {
            isOfBoard: false,
            cellIds: []
        },
        playerWeapon: {
            rotation: CONSTS.rotation.none,
            weapon: CONSTS.weapons.standard
        }
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

    if (game.isPlayerSetup && !cellData.isOf) {
        // Highlight ship setup locations
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
    unHighlightAllCells();
}


// Attempts to set up one of the player's ships at the cell with id
function playerSetup(id) {
    alert("player setup");
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
    // Update the game
    var status = shootCell(cellData.row, cellData.col, board);
    if (!status.success) {
        return status;
    }
    game.isPlayerTurn = !game.isPlayerTurn;
    // Update the UI
    setContentClass(id, status.isHit ? CONSTS.contentClasses.hit : CONSTS.contentClasses.miss);

    if (game.isPlayerTurn) {
        unHighlightAllCells();
    }

    return status;
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



/////////////////////////////////////////////////////////////////////////
/*                               AI                                    */
/////////////////////////////////////////////////////////////////////////

// Dictates how the AI will do it's turn
function makeAIMove() {
    // TODO: Add difficulty levels and incorporate use of weapons
    var openShots = getAvailableDfBoardCells();
    fireNormal(openShots[getRandomInt(0, openShots.length)]);
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

$("#rotate_button").click(rotateWeapon);
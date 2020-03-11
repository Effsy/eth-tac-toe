// window.onload = function() {
//   const url = window.location.origin;
//   let socket = io.connect(url);
// };

const url = window.location.origin;
let socket = io.connect(url);
let board = [0,0,0,0,0,0,0,0,0]
let nonce = 0;
let contractAddress = "0x2dFc473b8305445eb44d3538Bf286460d18Df071";
let contractAbi;
let TicTacToe;
let opponentAddress;
let matchId;

let startButton = document.getElementById("startMatchButton");
let mySignatures = []
let theirSignatures = []

import "./web3.min.js";
let newWeb3 = new Web3(window.ethereum);

let account;
// set account
newWeb3.eth.getAccounts( (err, accounts) => {
  if(err) alert(err)
  account = accounts[0]
})

var myTurn = true,
  symbol;

startButton.addEventListener('click', function() {
  opponentAddress = document.getElementById("opponentAddress").value

  $.getJSON("TicTacToe.json", function(json) {
    contractAbi = json.abi
    TicTacToe = new newWeb3.eth.Contract(contractAbi, contractAddress);

    let disputeLength = 2000
    TicTacToe.methods.startMatch(opponentAddress.toString(), disputeLength).send(
      {from: account}
    ).then(
      function(receipt) {
        matchId = receipt.events.MatchStarted.returnValues.matchId
        matchId = newWeb3.utils.hexToBytes(matchId)
        // console.log(newWeb3.utils.isHex(matchId))
        // console.log(matchId.length)
        // console.log(newWeb3.utils.fromAscii(matchId.substr(1)))
        // console.log(matchId.substr(1))


        renderTurnMessage();
      }
    )
  });
});

document.getElementById("printButton").addEventListener('click', function() {
  console.log("nonce")
  console.log(nonce)
  console.log("player1 sig")
  console.log(mySignatures)
  console.log("player2 sig")
  console.log(theirSignatures)
  console.log("board state")
  console.log(board)
  console.log("match id")
  console.log(newWeb3.utils.bytesToHex(matchId).toString())
})


function getBoardState() {
  var obj = {};

  // We will compose an object of all of the Xs and Ox
  // that are on the board
  $(".board button").each(function() {
    obj[$(this).attr("id")] = $(this).text() || "";
  });

  return obj;
}

function isGameOver() {
  var state = getBoardState(),
    // One of the rows must be equal to either of these
    // value for
    // the game to be over
    matches = ["XXX", "OOO"],
    // These are all of the possible combinations
    // that would win the game
    rows = [
      state.a0 + state.a1 + state.a2,
      state.b0 + state.b1 + state.b2,
      state.c0 + state.c1 + state.c2,
      state.a0 + state.b1 + state.c2,
      state.a2 + state.b1 + state.c0,
      state.a0 + state.b0 + state.c0,
      state.a1 + state.b1 + state.c1,
      state.a2 + state.b2 + state.c2
    ];

  // Loop over all of the rows and check if any of them compare
  // to either 'XXX' or 'OOO'
  for (var i = 0; i < rows.length; i++) {
    if (rows[i] === matches[0] || rows[i] === matches[1]) {
      return true;
    }
  }
}

function renderTurnMessage() {
  // Disable the board if it is the opponents turn
  if (!myTurn) {
    $("#messages").text("Your opponent's turn");
    $(".board button").attr("disabled", true);

    // Enable the board if it is your turn
  } else {
    $("#messages").text("Your turn.");
    $(".board button").removeAttr("disabled");
  }
}

function makeMove(e) {
  e.preventDefault();
  // It's not your turn
  if (!myTurn) return;
  // The space is already checked
  if ($(this).text().length) return;
  let position = $(this).attr("id")
  // Emit the move to the server
  socket.emit("make.move", {
    matchId: matchId,
    symbol: symbol,
    position: position
  });
}

// Event is called when either player makes a move
socket.on("move.made", function(data) {
  // Render the move
  $("#" + data.position).text(data.symbol);
  matchId = data.matchId

  // If the symbol is the same as the player's symbol,
  // we can assume it is their turn
  myTurn = data.symbol !== symbol;

  // If the game is still going, show who's turn it is
  if (!isGameOver()) {
    let index = getIndexFromPosition(data.position)
    let player = getPlayerFromSymbol(data.symbol)
    nonce = countMovesMade()

    // received the same move twice! did you double click?
    if(board[index] == player) return;
    board[index] = player

    // TODO: add matchId to stateroot
    let gameStatus = 0
    let stateRoot = newWeb3.utils.sha3(newWeb3.eth.abi.encodeParameters(
      ["bytes32", "uint8[9]", "uint8", "uint256"], [matchId, board, gameStatus, nonce]
    ))
    
    signState(stateRoot, account, function(signature){
      mySignatures[nonce] = signature
      // send signature of state
      socket.emit("send.signature", {
        sender: account,
        stateRoot: stateRoot,
        signature: signature,
        nonce: nonce
      });
    })

    renderTurnMessage();
    // If the game is over
  } else {
    // TODO: add game win logic
    // Show the message for the loser
    if (myTurn) {
      $("#messages").text("Game over. You lost.");

      // Show the message for the winner
    } else {
      $("#messages").text("Game over. You won!");
    }

    // Disable the board
    $(".board button").attr("disabled", true);
  }
});

// Set up the initial state when the game begins
socket.on("game.begin", function(data) {
  // The server will asign X or O to the player
  symbol = data.symbol;

  // Give X the first turn
  myTurn = symbol === "X";

  if(myTurn) {
    $("#messages").text("Waiting for state channel to be created");
    $(".board button").attr("disabled", true);
    document.getElementById("opponentAddress").style.visibility = "visible"
    document.getElementById("startMatchButton").style.visibility = "visible"
  } else {
    $("#messages").text("Waiting for opponent to initiate state channel");
    $(".board button").attr("disabled", true);
  }

});

socket.on("receive.signature", function(data) {
  theirSignatures[data.nonce] = data.signature
})

// Disable the board if the opponent leaves
socket.on("opponent.left", function() {
  $("#messages").text("Your opponent left the game.");
  $(".board button").attr("disabled", true);
});


$(function() {
  $(".board button").attr("disabled", true);
  $(".board> button").on("click", makeMove);
});

// utility functions

function signState(stateRoot, signer, callback) {
  newWeb3.eth.sign(stateRoot, signer, function(err, signature) {
    // on error should remove move from board?
    if(err) alert(err)
    else {
      callback(signature)
    }
  })
}

function countMovesMade() {
  let moves = 0
  for(let cell of board) if(cell != 0) moves++
  return moves
}

function getIndexFromPosition(position) {
  if(position == "a0") {
    return 0
  } else if(position == "a1") {
    return 1
  } else if(position == "a2") {
    return 2
  } else if(position == "b0") {
    return 3
  } else if(position == "b1") {
    return 4
  } else if(position == "b2") {
    return 5
  } else if(position == "c0") {
    return 6
  } else if(position == "c1") {
    return 7
  } else if(position == "c2") {
    return 8
  } else {
    alert("can't recognise move position")
    return;
  }
}

function getPlayerFromSymbol(symbol) {
  return symbol == "X" ? 1 : 2
}

import { httpServer } from "./src/http_server/server";
import WebSocket, { WebSocketServer } from "ws";
const HTTP_PORT = 8181;
const db = {
  connections: {},
  users: {},
  games: [],
  rooms: [],
};
console.log(`Start static http server on the ${HTTP_PORT} port!`);
httpServer.listen(HTTP_PORT);

//wss server
const wss = new WebSocketServer({ port: 3000 });

wss.on("connection", (ws) => {
  const current_connection = genNumdersToken(5);
  db.connections[current_connection] = ws;
  console.log("connections--->", Object.keys(db.connections));

  ws.on("message", (raw_data) => {
    // mDispatcher(rawData, current_connection);
    dispatchReq(raw_data, current_connection);
  });
  ws.on("close", () => {
    db.rooms = db.rooms.filter((el) => el.roomUsers[0].name !== db.users[current_connection].name);
    db.games = db.games.filter((el) => el.player_1 !== current_connection && el.player_2 !== current_connection);

    delete db.connections[current_connection];
    delete db.users[current_connection];
    console.log("closed");
  });
});

function dispatchReq(rawRequest, current_connection) {
  const json_object = JSON.parse(rawRequest);
  let res;
  console.log("req-->", json_object);
  const { type, data, id } = json_object;
  switch (type) {
    case "reg":
      console.log("reg");
      const { name, password } = JSON.parse(data);
      //create user
      const new_user = {
        name,
        password,
        id: Number(current_connection),
        index: Number(current_connection),
        error: false,
        errorText: "",
      };

      db.users[current_connection] = structuredClone(new_user);
      console.log("users-->", db.users);

      //reg
      const reg_data = (({ password, ...rest }) => rest)(new_user);
      res = { type: "reg", data: JSON.stringify(reg_data), id: 0 };
      sendToOne(res, current_connection);

      //rooms
      if (db.rooms.length > 0) {
        const update_room_res = {
          type: "update_room",
          data: JSON.stringify(db.rooms),
          id: 0,
        };
        sendToOne(update_room_res, current_connection);
      }

      break;

    case "create_room":
      const new_room = {
        roomId: db.rooms.length,
        roomUsers: [],
      };
      new_room.roomUsers.push({
        name: db.users[current_connection].name,
        index: db.users[current_connection].index,
      });

      db.rooms.push(new_room);
      sendToAllUpatedRooms();
      break;

    case "add_user_to_room":
      const { indexRoom } = JSON.parse(data);

      //create game
      const new_game = {
        idGame: db.games.length,
        player_1: String(db.rooms[indexRoom].roomUsers[0].index),
        player_2: current_connection,
        ready: 0,
        board: {},
        turn: !!Math.round(Math.random()) ? String(db.rooms[indexRoom].roomUsers[0].index) : current_connection,
      };

      db.games.push(new_game);

      //clean room
      db.rooms.splice(indexRoom, 1);
      sendToAllUpatedRooms();

      const new_game_res = {
        type: "create_game",
        data: { idGame: new_game.idGame, idPlayer: Number(new_game.player_2) },
        id: 0,
      };
      const res_1 = { ...new_game_res, data: JSON.stringify(new_game_res.data) };
      sendToOne(res_1, new_game.player_1);
      let res_2 = { ...new_game_res };
      res_2.data.idPlayer = Number(new_game.player_1);
      res_2.data = JSON.stringify(new_game_res.data);
      sendToOne(res_2, new_game.player_2);

      break;
    case "add_ships":
      const { gameId, ships, indexPlayer } = JSON.parse(data);
      const enemy_id = indexPlayer;
      // set ships
      db.games[gameId].board[current_connection] = {};
      db.games[gameId].board[current_connection].ships = ships;
      db.games[gameId].board[current_connection].enemy = enemy_id;
      db.games[gameId].ready = db.games[gameId].ready + 1;
      //set fields
      setField(current_connection, gameId, ships);
      if (db.games[gameId].ready === 2) {
        for (const key in db.games[gameId].board) {
          const res = {
            type: "start_game",
            data: JSON.stringify({
              ships: db.games[gameId].board[key].ships,
              currentPlayerIndex: Number(enemy_id), //????
            }),
            id: 0,
          };
          sendToOne(res, key);
        }

        //turn
        sendTurn(gameId);
      }
      break;
    case "attack":
      const { x, y, gameId: game_id, indexPlayer: index_player } = JSON.parse(data);
      if (index_player !== Number(db.games[game_id].turn)) {
        return;
      }
      const atttac_res = {
        type: "attack",

        data: JSON.stringify({
          position: {
            x,
            y,
          },
          currentPlayer: index_player,
          status: "miss",
        }),
        id: 0,
      };

      sendToAllLogged(atttac_res);
      sendTurn(game_id);
      break;

    case "randomAttack":
      let { x: r_x, y: r_y, gameId: r_game_id, indexPlayer: r_index_player } = JSON.parse(data);
      sendTurn(r_game_id);
      break;

    default:
      break;
  }
}

function sendToOne(res, current_connection) {
  db.connections[current_connection].send(JSON.stringify(res));
}

//add che
function sendToAllLogged(res) {
  for (const key in db.users) {
    db.connections[key].send(JSON.stringify(res));
  }
}

const genNumdersToken = (length = 15) => {
  const base = 10 ** length;
  const token = Math.floor(base + Math.random() * 9 * base).toString(); // token
  return token;
};
function sendToAllUpatedRooms() {
  const update_room_res = {
    type: "update_room",
    data: JSON.stringify(db.rooms),
    id: 0,
  };
  sendToAllLogged(update_room_res);
}

function sendTurn(gameId) {
  const turn = db.games[gameId].turn === db.games[gameId].player_1 ? db.games[gameId].player_2 : db.games[gameId].player_1;
  db.games[gameId].turn = turn;
  const res = {
    type: "turn",
    data: JSON.stringify({
      currentPlayer: Number(turn),
    }),
    id: 0,
  };

  sendToAllLogged(res); //chande to in curr game
}

function setField(current_connection, gameId, ships) {
  db.games[gameId].board[current_connection].field = ships;
  // console.log("ships-->", ships);
  const field = db.games[gameId].board[current_connection].field;
  console.log("field 1 -->", field);
  field.forEach((ship, ind) => {
    const coords = [];
    let dx = 0;
    let dy = 0;
    for (let c = 0; c < ship.length; c++) {
      ship.direction === true ? (dy = c) : (dx = c);
      coords.push([ship.position.x + dx, ship.position.y + dy]);
    }
    field[ind] = { ...ship, coords };
  });
  console.log("field 2 -->", field[0]);
}
// console.dir(util.inspect(ws, { showHidden: false, depth: false, colors: true }));
// const res = structuredClone(newUser);

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

  const { type, data } = json_object;
  switch (type) {
    case "reg":
      const { name, password } = JSON.parse(data);
      //create user
      const new_user = {
        name,
        password,
        id: Number(current_connection),
        index: Number(current_connection),
        error: false,
        errorText: "",
        wins: 0,
      };

      db.users[current_connection] = structuredClone(new_user);

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
      console.log(`pl1 ${new_game.player_1}   pl2 ${new_game.player_2}`);
      // console.log("turn-->", new_game.turn);
      db.games.push(new_game);

      //clean room
      db.rooms.splice(indexRoom, 1);
      sendToAllUpatedRooms();

      const new_game_res = {
        type: "create_game",
        data: { idGame: new_game.idGame, idPlayer: Number(new_game.player_2) },
        id: 0,
      };
      console.log(`cr game cur${current_connection}  op ${new_game.player_2}`);
      const res_1 = { ...new_game_res, data: JSON.stringify(new_game_res.data) };
      sendToOne(res_1, new_game.player_1);
      let res_2 = { ...new_game_res };
      res_2.data.idPlayer = Number(new_game.player_1);
      res_2.data = JSON.stringify(new_game_res.data);
      sendToOne(res_2, new_game.player_2);

      break;

    case "add_ships":
      const { gameId, ships, indexPlayer } = JSON.parse(data);
      const enemy_id = db.games[gameId].player_1 === String(indexPlayer) ? Number(db.games[gameId].player_2) : Number(db.games[gameId].player_1);

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
              currentPlayerIndex: Number(enemy_id),
            }),
            id: 0,
          };
          sendToOne(res, key);
        }
        sendTurn(gameId);
      }
      break;

    case "attack":
      const { x, y, gameId: game_id, indexPlayer: index_player } = JSON.parse(data);
      if (index_player !== Number(db.games[game_id].turn)) {
        return;
      }

      const coords = checkShot(JSON.parse(data));

      sendShots(coords, index_player);
      sendTurn(game_id);
      break;

    case "randomAttack":
      const { gameId: r_game_id, indexPlayer: r_index_player } = JSON.parse(data);
      const prep_data = { ...JSON.parse(data), x: random(), y: random() };
      const r_coords = checkShot(prep_data);

      sendShots(r_coords, r_index_player);
      sendTurn(r_game_id);
      break;
  }
}

function sendToOne(res, current_connection) {
  db.connections[current_connection].send(JSON.stringify(res));
}

function sendToAllLogged(res) {
  for (const key in db.users) {
    db.connections[key].send(JSON.stringify(res));
  }
}

function genNumdersToken(length = 10) {
  const base = 10 ** length;
  const token = Math.floor(base + Math.random() * 9 * base).toString(); // token
  return token;
}

function sendToAllUpatedRooms() {
  const update_room_res = {
    type: "update_room",
    data: JSON.stringify(db.rooms),
    id: 0,
  };
  sendToAllLogged(update_room_res);
}

function setField(current_connection, gameId, ships) {
  db.games[gameId].board[current_connection].field = ships;
  const field = db.games[gameId].board[current_connection].field;
  db.games[gameId].board[current_connection].ships_on = 10;

  field.forEach((ship, ind) => {
    const coords = [];
    let dx = 0;
    let dy = 0;
    for (let c = 0; c < ship.length; c++) {
      ship.direction === true ? (dy = c) : (dx = c);
      coords.push([ship.position.x + dx, ship.position.y + dy]);
    }
    field[ind] = { ...ship, coords, origin_coords: coords };
  });
  field.forEach((ship, ind) => {
    field[ind].area = [];

    if (ship.direction === false) {
      const s = ship.coords[0];
      field[ind].area.push([s[0] - 1, s[1] - 1], [s[0] - 1, s[1]], [s[0] - 1, s[1] + 1]);
      const e = ship.coords[ship.coords.length - 1];
      field[ind].area.push([e[0] + 1, e[1] - 1], [e[0] + 1, e[1]], [e[0] + 1, e[1] + 1]);
      ship.coords.forEach((m) => {
        field[ind].area.push([m[0], m[1] - 1], [m[0], m[1] + 1]);
      });
    } else {
      const s = ship.coords[0];
      field[ind].area.push([s[0] - 1, s[1] - 1], [s[0], s[1] - 1], [s[0] + 1, s[1] - 1]);
      const e = ship.coords[ship.coords.length - 1];
      field[ind].area.push([e[0] - 1, e[1] + 1], [e[0], e[1] + 1], [e[0] + 1, e[1] + 1]);
      ship.coords.forEach((m) => {
        field[ind].area.push([m[0] - 1, m[1]], [m[0] + 1, m[1]]);
      });
    }
  });
}

function checkShot(data) {
  const { x, y, gameId, indexPlayer } = data;
  const field = db.games[gameId].board[String(indexPlayer)].field;
  let coords = [[x, y, "miss"]];
  field.forEach((ship, idx) => {
    const before_ship_size = ship.coords.length;
    if (before_ship_size > 0) {
      const new_coords = ship.coords.filter((el) => !(el[0] === x && el[1] === y));
      field[idx].coords = new_coords;
      const after_sip_size = new_coords.length;
      if (after_sip_size === 0) {
        //killed
        coords = [];
        field[idx].origin_coords.forEach((el) => {
          el[2] = "killed";
          coords.push(el);
          db.games[gameId].board[String(indexPlayer)].ships_on -= 1;

          ///have to be 0 !!! win!!!
          if (db.games[gameId].board[String(indexPlayer)].ships_on <= 0) {
            const winner_id = String(indexPlayer) === db.games[gameId].player_1 ? db.games[gameId].player_2 : db.games[gameId].player_1;

            db.users[String(winner_id)].wins += 1; //add win to player
            let wins_table = [];
            for (const user in db.users) {
              if (Object.hasOwnProperty.call(db.users, user)) {
                if (db.users[user].wins > 0) {
                  wins_table.push({ name: db.users[user].name, wins: db.users[user].wins });
                }
              }
            }

            //send winner
            const res = {
              type: "finish",
              data: JSON.stringify({
                winPlayer: indexPlayer,
              }),
              id: 0,
            };
            sendToAllLogged(res);

            const wins_res = {
              type: "update_winners",
              data: JSON.stringify(wins_table),
              id: 0,
            };
            sendToAllLogged(wins_res);
          }
        });
        field[idx].area.forEach((el) => {
          el[2] = "miss";
          coords.push(el);
        });
        const turn = db.games[gameId].turn === db.games[gameId].player_1 ? db.games[gameId].player_2 : db.games[gameId].player_1;
        db.games[gameId].turn = turn;
      } else if (before_ship_size - after_sip_size === 1) {
        coords[0][2] = "shot";
      }
    }
  });
  if (coords[0][2] !== "miss") {
    const turn = db.games[gameId].turn === db.games[gameId].player_1 ? db.games[gameId].player_2 : db.games[gameId].player_1;
    db.games[gameId].turn = turn;
  }
  return coords;
}

function sendTurn(gameId) {
  const turn = db.games[gameId].turn === db.games[gameId].player_1 ? db.games[gameId].player_2 : db.games[gameId].player_1;
  db.games[gameId].turn = turn;
  console.log(`turn ->`, db.games[gameId].turn);
  const res = {
    type: "turn",
    data: JSON.stringify({
      currentPlayer: Number(db.games[gameId].turn),
    }),
    id: 0,
  };
  sendToAllLogged(res);
}

function random(min = 0, max = 9) {
  const rand = Math.floor(Math.random() * (max - min) + min);
  return rand;
}

function sendShots(coords, index_player) {
  coords.forEach((coord) => {
    const atttac_res = {
      type: "attack",
      data: JSON.stringify({
        position: {
          x: coord[0],
          y: coord[1],
        },
        currentPlayer: index_player,
        status: coord[2],
      }),
      id: 0,
    };

    sendToAllLogged(atttac_res);
  });
}
// console.dir(util.inspect(ws, { showHidden: false, depth: false, colors: true }));
// const res = structuredClone(newUser);

export interface DB {
  connections: { [key: string]: any };
  users: { [key: string]: any };
  games: any[];
  rooms: any[];
}

export interface Ship {
  position: { x: number; y: number };
  length: number;
  direction: boolean;
}

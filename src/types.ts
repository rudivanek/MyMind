export type CardType = "note" | "decision" | "option" | "assumption" | "risk" | "evidence";

export type Item = {
  id: string;
  title: string;
  tags: string[];
  createdAt: string;
  dueDate: string | null;
  description: string;
  posX: number;
  posY: number;
  color: string | null;
  width: number | null;
  height: number | null;
  scale: number | null;
  status: ItemStatus | null;
  cardType: CardType;
  mapId: string;
};

export type ItemStatus = "todo" | "done" | "question" | "important";

export type Connection = {
  id: string;
  sourceId: string;
  targetId: string;
  comment: string;
  labelDx: number;
  labelDy: number;
  mapId: string;
};

export type Map = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  folderId: string | null;
  isFavorite: boolean;
};

export type Folder = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
};

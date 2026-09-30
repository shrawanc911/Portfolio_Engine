const usersList: Set<string> = new Set();

export const addUserStocks = (userId: string) => {
  usersList.add(userId);
};

export const getSubscribers = () => {
  return usersList;
};

export const removeUser = (userId: string) => {
  usersList.delete(userId);
};

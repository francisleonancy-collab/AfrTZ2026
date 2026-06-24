export const mockApiResponses = {
  login: async (email: string, password: string) => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ user: { email, id: '1' }, token: 'mock-token' });
      }, 1000);
    });
  },
};

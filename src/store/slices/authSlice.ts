interface AuthState {
  user: any;
  token: string | null;
  error: string | null;
}

const initialState: AuthState = {
  user: null,
  token: null,
  error: null,
};

// Simplified reducer and action creators to mimic Redux Toolkit
export const setCredentials = (credentials: { user: any; token: string }) => ({
  type: 'auth/setCredentials',
  payload: credentials,
});

export const setError = (error: string | null) => ({
  type: 'auth/setError',
  payload: error,
});

export default function authReducer(state = initialState, action: any): AuthState {
  switch (action.type) {
    case 'auth/setCredentials':
      return {
        ...state,
        user: action.payload.user,
        token: action.payload.token,
        error: null,
      };
    case 'auth/setError':
      return {
        ...state,
        error: action.payload,
      };
    default:
      return state;
  }
}

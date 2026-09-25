import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  message: string | null;
}

class ErrorBoundary extends Component<Props, State> {
  state: State = { message: null };

  static getDerivedStateFromError(error: Error): State {
    return { message: error.message || 'Неизвестная ошибка' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI error:', error, info.componentStack);
  }

  render() {
    if (this.state.message) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-6">
          <div className="w-full max-w-[460px] border-2 border-primary bg-card p-6">
            <h1 className="font-head text-xl font-black uppercase text-primary">
              Что-то пошло не так
            </h1>
            <p className="mt-2 text-[14px] text-muted-foreground">
              Страница не смогла отрисоваться. Обновите её — данные не потеряются.
            </p>
            <p className="mt-3 break-words border-2 border-dashed border-primary p-2 text-[12px] text-muted-foreground">
              {this.state.message}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 w-full border-2 border-primary bg-accent px-4 py-2 font-head text-[0.8rem] font-bold uppercase text-accent-foreground"
            >
              Обновить страницу
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;

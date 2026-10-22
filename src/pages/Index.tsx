import LoginScreen from '@/components/LoginScreen';
import Footer from '@/components/Footer';
import TechnicianScreen from '@/components/technician/TechnicianScreen';
import useIndexController from '@/components/index/useIndexController';
import IndexTopBar from '@/components/index/IndexTopBar';
import IndexContent from '@/components/index/IndexContent';
import IndexDialogs from '@/components/index/IndexDialogs';

const Index = () => {
  const ctl = useIndexController();
  const { ready, isAuthed, login, kicked, isTechnician, user, logout } = ctl;

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background font-head uppercase text-primary">
        Загрузка...
      </div>
    );
  }

  if (!isAuthed) {
    return <LoginScreen onLogin={login} kicked={kicked} />;
  }

  if (isTechnician) {
    return (
      <TechnicianScreen
        userName={user?.fullName || user?.username || ''}
        onLogout={() => logout()}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <IndexTopBar ctl={ctl} />
      <IndexContent ctl={ctl} />
      <Footer />
      <IndexDialogs ctl={ctl} />
    </div>
  );
};

export default Index;

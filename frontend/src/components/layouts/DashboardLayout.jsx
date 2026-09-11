import React, {useContext} from 'react'
import Navbar from './Navbar';
import SideMenu from './SideMenu';
import { setUser, clearUser, fetchProfile } from '../../store/authSlice';
import { useSelector, useDispatch } from 'react-redux';


const DashboardLayout = ({ children, activeMenu }) => {
  const { user } = useSelector((state) => state.auth);

  return (
    <div className="min-h-screen bg-slate-50/50">
      <Navbar activeMenu={activeMenu} />
      {user && (
        <div className="flex">
          <div className="hidden lg:block shrink-0">
            <SideMenu activeMenu={activeMenu} />
          </div>

          <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6">{children}</main>
        </div>
      )}
    </div>
  );
};

export default DashboardLayout;


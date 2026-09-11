import React, {useState} from 'react'
import SideMenu from './SideMenu';
import {HiOutlineMenu, HiOutlineX} from 'react-icons/hi';
import WorkspaceSwitcher from './WorkspaceSwitcher.jsx';
import NotificationCenter from './NotificationCenter.jsx';

const Navbar = ({ activeMenu }) => {
  const [openSideMenu, setOpenSideMenu] = useState(false);

  return (
    <div className="flex items-center justify-between gap-4 bg-white border-b border-gray-200/50 backdrop-blur-[2px] py-3 px-4 sm:px-6 sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <button
          className="inline-flex items-center justify-center p-1.5 rounded-md text-gray-700 hover:bg-gray-100 lg:hidden cursor-pointer transition-colors"
          onClick={() => {
            setOpenSideMenu(!openSideMenu);
          }}
          aria-label="Toggle menu"
          aria-expanded={openSideMenu}
        >
          {openSideMenu ? (
            <HiOutlineX className="text-2xl text-gray-800" />
          ) : (
            <HiOutlineMenu className="text-2xl text-gray-800" />
          )}
        </button>
        <h2 className="text-lg font-bold text-gray-900 tracking-tight">TaskForge</h2>
      </div>

      <div className="flex items-center gap-3 ml-auto">
        <WorkspaceSwitcher />
        <NotificationCenter />
      </div>

      {openSideMenu && (
        <>
          <div
            className="fixed inset-0 top-[57px] bg-black/30 backdrop-blur-xs z-30 lg:hidden"
            onClick={() => setOpenSideMenu(false)}
            aria-hidden="true"
          />
          <div className="fixed top-[57px] left-0 bottom-0 bg-white z-40 shadow-2xl lg:hidden">
            <SideMenu activeMenu={activeMenu} onClose={() => setOpenSideMenu(false)} />
          </div>
        </>
      )}
    </div>
  );
};

export default Navbar;

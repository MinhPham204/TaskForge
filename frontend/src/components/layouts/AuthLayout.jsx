import React from 'react';
import UI_IMG from "../../assets/images/bg-img.png";

const AuthLayout = ({ children }) => {
  return (
    <div className="flex min-h-screen">
      <div className="w-screen min-h-screen md:h-screen md:overflow-y-auto md:w-[60vw] px-8 sm:px-12 pt-8 pb-12 flex flex-col justify-between">
        <h2 className="text-lg font-medium text-black">TaskForge</h2>
        <div className="flex-1 flex flex-col justify-center">
          {children}
        </div>
      </div>

      <div className="hidden md:flex w-[40vw] h-screen items-center justify-center bg-blue-50 bg-[url('/bg-img.png')] bg-cover bg-no-repeat bg-center overflow-hidden sticky top-0">
        <img src={UI_IMG} alt="" className="w-64 lg:w-[100%]" />
      </div>
    </div>
  );
};

export default AuthLayout;

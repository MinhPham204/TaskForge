import React, {useState, useId} from 'react';
import {FaRegEye, FaRegEyeSlash} from "react-icons/fa6";
// import showPassword from "";

const Input = ({value, onChange, label, placeholder, type, disabled = false}) => {
  const inputId = useId();
  const [showPassword, setShowPassword] = useState(false);

  const toggleShowPassword = () => {
    setShowPassword(!showPassword);
  };
  
  
  return (
    <div>
     <label htmlFor={inputId} className="text-[13px] text-slate-800">{label}</label>
    <div className="input-box">
        <input id={inputId} disabled={disabled} type={type == 'password' ? showPassword ? 'text' : 'password' : type}
        placeholder={placeholder}
        className="w-full bg-transparent outline-none"
        value={value}
        onChange={(e) => onChange(e)}
        />

     {type === "password" && (
          showPassword ? (
            <FaRegEye
              size={22}
              className="text-primary cursor-pointer"
              onClick={() => toggleShowPassword()}
            />
          ) : (
            <FaRegEyeSlash
              size={22}
              className="text-slate-400 cursor-pointer"
              onClick={() => toggleShowPassword()}
            />
          )
        )}
      </div>
    </div>
  );
};

export default Input;

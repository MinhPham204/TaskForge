import React, {useState} from 'react'
import AuthLayout from '../../components/layouts/AuthLayout'
import { Link, useNavigate, useLocation } from 'react-router-dom';
import Input from "../../components/Inputs/Input"
import { validateEmail } from '../../utils/helper';
import axiosInstance from '../../utils/axiosInstance';
import { API_PATHS } from '../../utils/apiPaths';
import { useDispatch } from 'react-redux';
import { setCredentials, fetchMyOrganizations } from '../../store/authSlice';
const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);

  const navigate = useNavigate();
  const dispatch = useDispatch();

  const location = useLocation();
  //Handle Login Form Submit
  const handleLogin = async (e) => {
    e.preventDefault();

    if(!validateEmail(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    if(!password){
      setError("Please enter the password");
      return;
    }
    setError("");

    // API Call
    try {
      const response = await axiosInstance.post(API_PATHS.AUTH.LOGIN, {
        email,
        password,
      });

      // NestJS returns access/refresh tokens and a global UUID user identity.
      const { accessToken, user } = response.data;

      if (accessToken && user) {
        // setCredentials tự động lưu tokens vào localStorage và cập nhật Redux state
        dispatch(setCredentials(response.data));
        // Lấy danh sách workspace và chọn active organization
        await dispatch(fetchMyOrganizations());

        // Lấy thông tin redirect từ query string
        const query = new URLSearchParams(location.search);
        const from = query.get("from"); // vd: /accept-invite?token=abc123

        if (from) {
          navigate(decodeURIComponent(from), { replace: true });
        } else {
          // Root resolves the destination from the active Membership role.
          navigate("/", { replace: true });
        }
      }
    } catch (error) {
      if (error.response && error.response.data.message) {
        setError(error.response.data.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    }
  }


  return (
    <AuthLayout>
      <div className="lg:w-[70%] h-3/4 md:h-full flex flex-col justify-center">
        <h3 className="text-xl font-semibold text-black">Welcome Back</h3>
        <p className="text-xs text-slate-700 mt-[5px] mb-6">
          Please enter your details to log in
        </p>
        <form onSubmit={handleLogin}>
          <Input
            value={email}
            onChange={({target}) => setEmail(target.value)}
            label="Email Address"
            placeholder="john@example.com"
            type="text"
          />

          <Input
            value={password}
            onChange={({target}) => setPassword(target.value)}
            label="Password"
            placeholder=""
            type="password"
          />
          <div className="text-right mt-1 mb-3">
              <Link 
                  to="/forgot-password" 
                  className="text-sm font-medium text-primary underline"
              >
                  Forgot Password?
              </Link>
          </div>
          {error && <p className="text-red-500 text-xs pb-2.5">{error}</p>}

          <button type="submit" className="btn-primary">Login</button>
          <p className="text-[13px] text-slate-800 mt-3">Don't have an account?{" "}
            <Link className="font-medium text-primary underline" to="/signup">SignUp</Link>
          </p>
        </form>
      </div>
    </AuthLayout>
  )
}

export default Login

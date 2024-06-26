import requests
import time

BASE_URL = "http://localhost:7755/auth"


# 注册用户
def register_user(username, password, email):
    url = f"{BASE_URL}/register"
    payload = {
        "username": username,
        "passwordHash": password,
        "email": email
    }
    response = requests.post(url, json=payload)
    print(f"Register User: {response.status_code}, {response.json()}")
    return response.status_code == 200


# 验证邮箱
def verify_email(token):
    url = f"{BASE_URL}/verify_email"
    payload = {
        "token": token
    }
    response = requests.post(url, json=payload)
    print(f"Verify Email: {response.status_code}, {response.json()}")
    return response.status_code == 200


# 登录用户
def login_user(username, password):
    url = f"{BASE_URL}/login"
    payload = {
        "username": username,
        "passwordHash": password
    }
    response = requests.post(url, json=payload)
    print(f"Login User: {response.status_code}, {response.json()}")
    if response.status_code == 200:
        return response.json().get("data").get("token")
    return None


# 注销用户
def logout_user(token):
    url = f"{BASE_URL}/logout"
    headers = {
        "Authorization": f"Bearer {token}"
    }
    response = requests.post(url, headers=headers)
    print(f"Logout User: {response.status_code}, {response.json()}")
    return response.status_code == 200


# 获取用户信息
def get_user_info(token):
    url = f"{BASE_URL}/user_info"
    headers = {
        "Authorization": f"Bearer {token}"
    }
    response = requests.get(url, headers=headers)
    print(f"Get User Info: {response.status_code}, {response.json()}")


# 刷新令牌
def refresh_token(token):
    url = f"{BASE_URL}/refresh_token"
    headers = {
        "Authorization": f"Bearer {token}"
    }
    response = requests.post(url, headers=headers)
    print(f"Refresh Token: {response.status_code}, {response.json()}")
    if response.status_code == 200:
        return response.json().get("data").get("token")
    return None


# 请求重置密码
def request_reset_password(email):
    url = f"{BASE_URL}/request_reset_password"
    payload = {
        "email": email
    }
    response = requests.post(url, json=payload)
    print(f"Request Reset Password: {response.status_code}, {response.json()}")


# 重置密码
def reset_password(token, new_password):
    url = f"{BASE_URL}/reset_password"
    payload = {
        "token": token,
        "newPassword": new_password
    }
    response = requests.post(url, json=payload)
    print(f"Reset Password: {response.status_code}, {response.json()}")


# 更改密码
def change_password(token, old_password, new_password):
    url = f"{BASE_URL}/change_password"
    headers = {
        "Authorization": f"Bearer {token}"
    }
    payload = {
        "oldPassword": old_password,
        "newPassword": new_password
    }
    response = requests.post(url, headers=headers, json=payload)
    print(f"Change Password: {response.status_code}, {response.json()}")


# 模拟邮箱验证
def simulate_email_verification():
    # This function simulates the retrieval of the email verification token.
    # In a real scenario, you would retrieve this from the email sent to the user.
    return "simulated_verification_token"


# 测试流程
def test_flow():
    username = "waiyuchan"
    password = "Test@123##"
    email = "waiyuchan@example.com"
    new_password = "NewTest@123##"

    # 注册用户
    if not register_user(username, password, email):
        return

    # 模拟等待邮件发送
    time.sleep(1)

    # 验证邮箱
    verification_token = simulate_email_verification()
    if not verify_email(verification_token):
        return

    # 登录用户
    token = login_user(username, password)
    if not token:
        return

    # 获取用户信息
    get_user_info(token)

    # 注销用户
    if not logout_user(token):
        return

    # 再次登录用户
    token = login_user(username, password)
    if not token:
        return

    # 刷新令牌
    new_token = refresh_token(token)
    if not new_token:
        return

    # 注销用户
    if not logout_user(new_token):
        return

    # 请求重置密码
    request_reset_password(email)

    # 模拟等待邮件发送
    time.sleep(1)

    # 模拟重置密码
    reset_password_token = simulate_email_verification()
    reset_password(reset_password_token, new_password)

    # 用新密码登录
    token = login_user(username, new_password)
    if not token:
        return

    # 更改密码
    change_password(token, new_password, password)


if __name__ == "__main__":
    test_flow()

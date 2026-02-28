import pandas as pd
import numpy as np

df = pd.read_csv('/home/user/Documents/Calling/Rose/test_employees.csv')

# Payroll file
df_payroll = df[['Employee_ID', 'Name', 'Department', 'Monthly_Salary']].copy()
df_payroll = df_payroll.rename(columns={'Employee_ID': 'employee_id', 'Name': 'name', 'Department': 'department', 'Monthly_Salary': 'salary'})

df_payroll['email'] = df_payroll['name'].apply(lambda x: str(x).replace(" ", ".").lower() + "@hit.ac.zw")
df_payroll.loc[df_payroll['name'].str.contains('Phantom', na=False), 'email'] = None
df_payroll['phone_number'] = '+263772' + np.random.randint(100000, 999999, size=len(df)).astype(str)

df_payroll.to_excel('dummy_payroll.xlsx', index=False)

# Attendance file
df_att = df[['Employee_ID', 'Days_Present']].copy()
df_att = df_att.rename(columns={'Employee_ID': 'employee_id'})

df_att.to_excel('dummy_attendance.xlsx', index=False)

print("Test files dummy_payroll.xlsx and dummy_attendance.xlsx created in ml_service directory.")

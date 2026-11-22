' GatePass launcher: starts the project in background (if not running) and opens the website
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
projectDir = fso.GetParentFolderName(WScript.ScriptFullName)

Function IsUp()
  Dim x, ok
  ok = False
  On Error Resume Next
  Set x = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  x.setTimeouts 1500, 1500, 1500, 1500
  x.Open "GET", "http://127.0.0.1:3000/config.json", False
  x.Send
  If Err.Number = 0 Then
    If x.Status = 200 Then ok = True
  End If
  Err.Clear
  On Error GoTo 0
  IsUp = ok
End Function

If Not IsUp() Then
  sh.CurrentDirectory = projectDir
  sh.Run "cmd /c npm start", 0, False
  For i = 1 To 90
    WScript.Sleep 1000
    If IsUp() Then Exit For
  Next
End If
sh.Run "http://localhost:3000"

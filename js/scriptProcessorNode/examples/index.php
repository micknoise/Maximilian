<html><head>
<meta http-equiv="content-type" content="text/html; charset=UTF-8">
<title>
	Javascript Audio Processing
</title>
</head>
<body>
<?php
$directory = "maximilian_examples_web/";

$phpfiles = glob("*.html");
// $phpfiles = glob($directory . "*.html");

natsort($phpfiles);

foreach($phpfiles as $phpfile)
{
echo "<a href=./$phpfile>".basename($phpfile)."</a>";
echo "\n</br>";
}
?>
</body>
</html>
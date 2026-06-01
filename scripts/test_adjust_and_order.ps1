$base='http://localhost:5002'
try {
  Write-Host 'Logging in admin...'
  $admin = Invoke-RestMethod -Method Post -Uri "$base/api/auth/login" -Body (@{email='admin@petfood.tn'; password='PetfoodTN2024!'} | ConvertTo-Json) -ContentType 'application/json' -ErrorAction Stop
  $admintoken = $admin.token
  Write-Host 'Admin token obtained'

  $products = Invoke-RestMethod -Method Get -Uri "$base/api/products" -ErrorAction Stop
  $p = $products | Where-Object { $_.stock -gt 0 } | Select-Object -First 1

  if (-not $p) {
    Write-Host 'No product with stock>0, creating product...'
    $new = Invoke-RestMethod -Method Post -Uri "$base/api/products" -Headers @{Authorization="Bearer $admintoken"} -Body (@{name='Test Product'; description='Test'; price=9.99; stock=10; category='test'} | ConvertTo-Json) -ContentType 'application/json' -ErrorAction Stop
    $p = $new
    $productId = if ($p.id) { $p.id } elseif ($p._id) { $p._id } else { $null }
    Write-Host "Created product $productId"
  } else {
    $productId = if ($p.id) { $p.id } elseif ($p._id) { $p._id } else { $null }
    Write-Host "Found product $productId with stock $($p.stock)"
  }

  if (-not $productId) { Write-Host 'Unable to determine product id'; exit 0 }

  Write-Host "Adjusting stock +10 for product $productId"
  Invoke-RestMethod -Method Patch -Uri "$base/api/products/$productId/stock/adjust" -Headers @{Authorization="Bearer $admintoken"} -Body (@{adjustment=10; reason='Test adjust for order creation'} | ConvertTo-Json) -ContentType 'application/json' -ErrorAction Stop

  Write-Host 'Admin adjust done'
  Write-Host 'Logging in client...'
  $client = Invoke-RestMethod -Method Post -Uri "$base/api/auth/login" -Body (@{email='client@petfood.tn'; password='MonChat123!'} | ConvertTo-Json) -ContentType 'application/json' -ErrorAction Stop
  $ctoken = $client.token

  $priceVal = $p.price
  if (-not $priceVal) { $priceVal = 9.99 }
  $price = [decimal]$priceVal

  $body = @{
    items = @(@{productId = $pid; quantity=1; price = $price})
    total = $price
    address = '123 Test St'
    phone = '00000000'
    paymentMethod = 'cash'
  }

  Write-Host 'Creating order as client...'
  $r = Invoke-RestMethod -Method Post -Uri "$base/api/orders" -Headers @{Authorization="Bearer $ctoken"} -Body ($body | ConvertTo-Json -Depth 5) -ContentType 'application/json' -ErrorAction Stop
  Write-Host 'Order created:'
  $r | ConvertTo-Json -Depth 5

} catch {
  Write-Host 'ERROR:'
  Write-Host $_.Exception.Message
  if ($_.Exception.Response) {
    try {
      $stream = $_.Exception.Response.GetResponseStream()
      $reader = New-Object System.IO.StreamReader($stream)
      $text = $reader.ReadToEnd()
      Write-Host 'Response body:'
      Write-Host $text
    } catch {}
  }
}

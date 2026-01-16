sudo nano /etc/systemd/system/usage-api.service


--------:USE THIS UPDATE CODE AND SEE THE LOG:---

sudo systemctl restart usage-api.service
sudo systemctl daemon-reload
sudo systemctl enable usage-api.service
sudo systemctl start usage-api.service
journalctl -u usage-api.service -f





-----------------CLOUDFLARED----------------------------------------------------------
sudo apt update
sudo apt install cloudflared -y
cloudflared --version
cloudflared tunnel login
cloudflared tunnel create usage-api

✅ 4) Create Cloudflare config

sudo mkdir -p /etc/cloudflared
sudo nano /etc/cloudflared/config.yml


config.yml
tunnel: de8eb58d-57e3-40e8-a290-f883be2b2a79
credentials-file: /home/racha/.cloudflared/de8eb58d-57e3-40e8-a290-f883be2b2a79.json

ingress:
  - hostname: data.sunita.space
    service: http://localhost:3001
  - service: http_status:404


create dns route
cloudflared tunnel route dns usage-api data.sunita.space
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
sudo systemctl status cloudflared
journalctl -u cloudflared -f








sudo systemctl stop cloudflared
sudo systemctl disable cloudflared
sudo rm -f /etc/systemd/system/cloudflared.service
sudo systemctl daemon-reload
cloudflared tunnel list
cloudflared tunnel delete usage-api
cloudflared tunnel delete <tunnel-name>

-----Remove local config files
rm -rf ~/.cloudflared
sudo rm -rf /etc/cloudflared





sudo systemctl restart cloudflared
sudo systemctl status cloudflared --no-pager
sudo journalctl -u cloudflared -n 30 --no-pager




live logs
journalctl -u usage-api.service -f
journalctl -u cloudflared -f

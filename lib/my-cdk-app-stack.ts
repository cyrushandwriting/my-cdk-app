import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export class VpcInfrastructureStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create VPC
    const vpc = new ec2.Vpc(this, 'TestVPCFromCDK', {
      cidr: '10.0.0.0/24',
      maxAzs: 1, // Using single AZ for simplicity
      subnetConfiguration: [], // We'll create subnets manually
      enableDnsHostnames: true,
      enableDnsSupport: true,
    });

    // Create Internet Gateway
    const igw = new ec2.CfnInternetGateway(this, 'InternetGateway', {
      tags: [{ key: 'Name', value: 'TestVPCFromCDK-IGW' }],
    });

    // Attach Internet Gateway to VPC
    new ec2.CfnVPCGatewayAttachment(this, 'VPCGatewayAttachment', {
      vpcId: vpc.vpcId,
      internetGatewayId: igw.ref,
    });

    // Create Public Subnet
    const publicSubnet = new ec2.CfnSubnet(this, 'PublicSubnet', {
      vpcId: vpc.vpcId,
      cidrBlock: '10.0.0.0/26', // 64 IPs (10.0.0.0 - 10.0.0.63)
      availabilityZone: cdk.Stack.of(this).availabilityZones[0],
      mapPublicIpOnLaunch: true,
      tags: [{ key: 'Name', value: 'Public Subnet' }],
    });

    // Create Private Subnet
    const privateSubnet = new ec2.CfnSubnet(this, 'PrivateSubnet', {
      vpcId: vpc.vpcId,
      cidrBlock: '10.0.0.64/26', // 64 IPs (10.0.0.64 - 10.0.0.127)
      availabilityZone: cdk.Stack.of(this).availabilityZones[0],
      mapPublicIpOnLaunch: false,
      tags: [{ key: 'Name', value: 'Private Subnet' }],
    });

    // Create Elastic IP for NAT Gateway
    const natEip = new ec2.CfnEIP(this, 'NatGatewayEIP', {
      domain: 'vpc',
      tags: [{ key: 'Name', value: 'NAT Gateway EIP' }],
    });

    // Create NAT Gateway in Public Subnet
    const natGateway = new ec2.CfnNatGateway(this, 'NatGateway', {
      allocationId: natEip.attrAllocationId,
      subnetId: publicSubnet.ref,
      tags: [{ key: 'Name', value: 'NAT Gateway' }],
    });

    // Create Public Route Table
    const publicRouteTable = new ec2.CfnRouteTable(this, 'PublicRouteTable', {
      vpcId: vpc.vpcId,
      tags: [{ key: 'Name', value: 'Public Route Table' }],
    });

    // Create Private Route Table
    const privateRouteTable = new ec2.CfnRouteTable(this, 'PrivateRouteTable', {
      vpcId: vpc.vpcId,
      tags: [{ key: 'Name', value: 'Private Route Table' }],
    });

    // Create Public Route (to Internet Gateway)
    new ec2.CfnRoute(this, 'PublicRoute', {
      routeTableId: publicRouteTable.ref,
      destinationCidrBlock: '0.0.0.0/0',
      gatewayId: igw.ref,
    });

    // Create Private Route (to NAT Gateway)
    new ec2.CfnRoute(this, 'PrivateRoute', {
      routeTableId: privateRouteTable.ref,
      destinationCidrBlock: '0.0.0.0/0',
      natGatewayId: natGateway.ref,
    });

    // Associate Public Subnet with Public Route Table
    new ec2.CfnSubnetRouteTableAssociation(this, 'PublicSubnetAssociation', {
      subnetId: publicSubnet.ref,
      routeTableId: publicRouteTable.ref,
    });

    // Associate Private Subnet with Private Route Table
    new ec2.CfnSubnetRouteTableAssociation(this, 'PrivateSubnetAssociation', {
      subnetId: privateSubnet.ref,
      routeTableId: privateRouteTable.ref,
    });

    // Create Public Network ACL
    const publicNacl = new ec2.CfnNetworkAcl(this, 'PublicNetworkAcl', {
      vpcId: vpc.vpcId,
      tags: [{ key: 'Name', value: 'Public Network ACL' }],
    });

    // Create Private Network ACL
    const privateNacl = new ec2.CfnNetworkAcl(this, 'PrivateNetworkAcl', {
      vpcId: vpc.vpcId,
      tags: [{ key: 'Name', value: 'Private Network ACL' }],
    });

    // Public NACL Rules - Allow all traffic (typical for public subnet)
    new ec2.CfnNetworkAclEntry(this, 'PublicNaclInboundRule', {
      networkAclId: publicNacl.ref,
      ruleNumber: 100,
      protocol: -1,
      ruleAction: 'allow',
      cidrBlock: '0.0.0.0/0',
    });

    new ec2.CfnNetworkAclEntry(this, 'PublicNaclOutboundRule', {
      networkAclId: publicNacl.ref,
      ruleNumber: 100,
      protocol: -1,
      ruleAction: 'allow',
      cidrBlock: '0.0.0.0/0',
      egress: true,
    });

    // Private NACL Rules - Allow VPC traffic and outbound internet
    new ec2.CfnNetworkAclEntry(this, 'PrivateNaclInboundVPC', {
      networkAclId: privateNacl.ref,
      ruleNumber: 100,
      protocol: -1,
      ruleAction: 'allow',
      cidrBlock: '10.0.0.0/24',
    });

    new ec2.CfnNetworkAclEntry(this, 'PrivateNaclInboundEphemeral', {
      networkAclId: privateNacl.ref,
      ruleNumber: 110,
      protocol: 6, // TCP
      ruleAction: 'allow',
      cidrBlock: '0.0.0.0/0',
      portRange: {
        from: 1024,
        to: 65535,
      },
    });

    new ec2.CfnNetworkAclEntry(this, 'PrivateNaclOutbound', {
      networkAclId: privateNacl.ref,
      ruleNumber: 100,
      protocol: -1,
      ruleAction: 'allow',
      cidrBlock: '0.0.0.0/0',
      egress: true,
    });

    // Associate NACLs with Subnets
    new ec2.CfnSubnetNetworkAclAssociation(this, 'PublicSubnetNaclAssoc', {
      subnetId: publicSubnet.ref,
      networkAclId: publicNacl.ref,
    });

    new ec2.CfnSubnetNetworkAclAssociation(this, 'PrivateSubnetNaclAssoc', {
      subnetId: privateSubnet.ref,
      networkAclId: privateNacl.ref,
    });

    // Create Security Group for Public EC2 (Web Server)
    const publicSecurityGroup = new ec2.SecurityGroup(this, 'PublicSecurityGroup', {
      vpc: vpc,
      description: 'Security group for public EC2 instance',
      allowAllOutbound: true,
    });

    // Allow SSH and HTTP access from internet
    publicSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      'Allow SSH access'
    );

    publicSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'Allow HTTP access'
    );

    publicSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow HTTPS access'
    );

    // Create Security Group for Private EC2
    const privateSecurityGroup = new ec2.SecurityGroup(this, 'PrivateSecurityGroup', {
      vpc: vpc,
      description: 'Security group for private EC2 instance',
      allowAllOutbound: true,
    });

    // Allow SSH access from public subnet and all traffic from VPC
    privateSecurityGroup.addIngressRule(
      ec2.Peer.ipv4('10.0.0.0/26'), // Public subnet CIDR
      ec2.Port.tcp(22),
      'Allow SSH from public subnet'
    );

    privateSecurityGroup.addIngressRule(
      ec2.Peer.ipv4('10.0.0.0/24'), // VPC CIDR
      ec2.Port.allTraffic(),
      'Allow all traffic from VPC'
    );

    // Get latest Amazon Linux 2 AMI
    const amznLinuxAmi = ec2.MachineImage.latestAmazonLinux({
      generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
    });

    // Create Public EC2 Instance
    const publicInstance = new ec2.Instance(this, 'PublicInstance', {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      machineImage: amznLinuxAmi,
      securityGroup: publicSecurityGroup,
      vpcSubnets: {
        subnets: [ec2.Subnet.fromSubnetId(this, 'PublicSubnetRef', publicSubnet.ref)],
      },
      keyName: 'KPLegend1', // Replace with your actual key pair name
      userData: ec2.UserData.custom(`#!/bin/bash
yum update -y
yum install -y httpd
systemctl start httpd
systemctl enable httpd
echo "<h1>Hello from Public Instance</h1>" > /var/www/html/index.html`),
    });

    // Create Private EC2 Instance
    const privateInstance = new ec2.Instance(this, 'PrivateInstance', {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      machineImage: amznLinuxAmi,
      securityGroup: privateSecurityGroup,
      vpcSubnets: {
        subnets: [ec2.Subnet.fromSubnetId(this, 'PrivateSubnetRef', privateSubnet.ref)],
      },
      keyName: 'KPLegend1', // Replace with your actual key pair name
      userData: ec2.UserData.custom(`#!/bin/bash
yum update -y
echo "Private instance setup complete" > /home/ec2-user/setup.log`),
    });

    // Add tags to instances
    cdk.Tags.of(publicInstance).add('Name', 'Public Web Server');
    cdk.Tags.of(privateInstance).add('Name', 'Private Server');

    // Outputs
    new cdk.CfnOutput(this, 'VPCId', {
      value: vpc.vpcId,
      description: 'VPC ID',
    });

    new cdk.CfnOutput(this, 'PublicSubnetId', {
      value: publicSubnet.ref,
      description: 'Public Subnet ID',
    });

    new cdk.CfnOutput(this, 'PrivateSubnetId', {
      value: privateSubnet.ref,
      description: 'Private Subnet ID',
    });

    new cdk.CfnOutput(this, 'PublicInstanceId', {
      value: publicInstance.instanceId,
      description: 'Public EC2 Instance ID',
    });

    new cdk.CfnOutput(this, 'PrivateInstanceId', {
      value: privateInstance.instanceId,
      description: 'Private EC2 Instance ID',
    });

    new cdk.CfnOutput(this, 'PublicInstanceIP', {
      value: publicInstance.instancePublicIp,
      description: 'Public Instance Public IP',
    });

    new cdk.CfnOutput(this, 'NATGatewayId', {
      value: natGateway.ref,
      description: 'NAT Gateway ID',
    });
  }
}